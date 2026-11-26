import crypto from 'crypto';
import { db, sqlNow } from './db.ts';

export type PaymentProviderName = 'paystack' | 'flutterwave' | 'sandbox';

export interface InitPaymentParams {
  userId: number;
  email: string;
  campaignId?: number | null;
  seoOrderId?: number | null;
  amount: number;
  currency: 'USD' | 'NGN';
  provider: PaymentProviderName;
  idempotencyKey: string;
  callbackUrl: string;
  description: string;
}

export async function getActiveDefaultProvider(): Promise<PaymentProviderName> {
  const row = await db.queryOne<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'payment_default_provider'`
  );
  const v = row?.value;
  if (v === 'paystack' || v === 'flutterwave' || v === 'sandbox') return v;
  return 'paystack';
}

export async function initializePayment(params: InitPaymentParams) {
  // Enforce idempotency
  const existing = await db.queryOne<Record<string, any>>(
    `SELECT * FROM payments WHERE idempotency_key = ?`,
    [params.idempotencyKey]
  );

  if (existing) {
    return {
      payment: existing,
      mode: existing.provider,
      checkoutUrl: null,
      requiresServerVerify: existing.status === 'pending',
    };
  }

  const txRef = `VR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const paymentId = await db.insert(
    `INSERT INTO payments (
       user_id, campaign_id, seo_order_id, tx_ref, idempotency_key,
       provider, amount, currency, status, metadata_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      params.userId,
      params.campaignId ?? null,
      params.seoOrderId ?? null,
      txRef,
      params.idempotencyKey,
      params.provider,
      params.amount,
      params.currency,
      JSON.stringify({ description: params.description }),
    ]
  );

  if (params.provider === 'paystack' && process.env.PAYSTACK_SECRET_KEY) {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: params.email,
        amount: Math.round(params.amount * 100),
        currency: params.currency,
        reference: txRef,
        callback_url: params.callbackUrl,
      }),
    });
    const data = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string };
    };
    if (!res.ok || !data.status || !data.data?.authorization_url) {
      await db.execute(
        `UPDATE payments SET status = 'failed', failure_reason = ?, updated_at = ${sqlNow()} WHERE id = ?`,
        [data.message || 'Paystack initialization failed', paymentId]
      );
      throw new Error(data.message || 'Paystack initialization failed');
    }
    const payment = await db.queryOne(`SELECT * FROM payments WHERE id = ?`, [paymentId]);
    return {
      payment,
      mode: 'paystack_live' as const,
      checkoutUrl: data.data.authorization_url,
      requiresServerVerify: true,
    };
  }

  if (params.provider === 'flutterwave' && process.env.FLUTTERWAVE_SECRET_KEY) {
    const res = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: params.amount,
        currency: params.currency,
        redirect_url: params.callbackUrl,
        payment_options: 'card,banktransfer,ussd,mobilemoneyghana,mpesa,account',
        customer: { email: params.email },
        customizations: {
          title: 'Vantage Reach',
          description: params.description,
        },
        meta: {
          userId: params.userId,
          campaignId: params.campaignId ?? null,
          seoOrderId: params.seoOrderId ?? null,
        },
      }),
    });
    const data = (await res.json()) as {
      status?: string;
      message?: string;
      data?: { link?: string };
    };
    if (!res.ok || data.status !== 'success' || !data.data?.link) {
      await db.execute(
        `UPDATE payments SET status = 'failed', failure_reason = ?, updated_at = ${sqlNow()} WHERE id = ?`,
        [data.message || 'Flutterwave initialization failed', paymentId]
      );
      throw new Error(data.message || 'Flutterwave initialization failed');
    }
    const payment = await db.queryOne(`SELECT * FROM payments WHERE id = ?`, [paymentId]);
    return {
      payment,
      mode: 'flutterwave_live' as const,
      checkoutUrl: data.data.link,
      requiresServerVerify: true,
    };
  }

  // Test / Sandbox Checkout Mode when live merchant keys are not set in environment
  const payment = await db.queryOne(`SELECT * FROM payments WHERE id = ?`, [paymentId]);
  return {
    payment,
    mode: 'sandbox_checkout' as const,
    checkoutUrl: null,
    requiresServerVerify: true,
    notice:
      params.provider === 'sandbox'
        ? 'Using Vantage Sandbox Checkout for server-side verification testing.'
        : `${params.provider.toUpperCase()} live secret key is not set on server; routed to secure Sandbox Verification mode.`,
  };
}

export async function verifyPaymentOnServer(
  txRef: string,
  options: { simulateOutcome?: 'succeed' | 'fail'; providerTransactionId?: string; viaWebhook?: boolean } = {}
) {
  const payment = await db.queryOne<{
    id: number;
    user_id: number;
    campaign_id: number | null;
    seo_order_id: number | null;
    tx_ref: string;
    provider: PaymentProviderName;
    amount: number;
    currency: string;
    status: string;
  }>(`SELECT * FROM payments WHERE tx_ref = ?`, [txRef]);

  if (!payment) {
    throw new Error('Transaction reference not found.');
  }

  // Idempotent return if already verified
  if (payment.status === 'verified') {
    return { payment, alreadyVerified: true, verified: true };
  }

  let verifiedOk = false;
  let failureReason = '';
  let providerRef = options.providerTransactionId || `VER-${txRef}`;

  if (payment.provider === 'paystack' && process.env.PAYSTACK_SECRET_KEY) {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(txRef)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const data = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { status?: string; amount?: number; currency?: string; reference?: string };
    };
    const expectedMinor = Math.round(Number(payment.amount) * 100);
    const paidCurrency = String(data.data?.currency || '').toUpperCase();
    if (
      res.ok &&
      data.status &&
      data.data?.status === 'success' &&
      Number(data.data?.amount || 0) >= expectedMinor &&
      (!paidCurrency || paidCurrency === payment.currency.toUpperCase())
    ) {
      verifiedOk = true;
      providerRef = data.data.reference || providerRef;
    } else {
      failureReason = data.data?.status || data.message || 'Paystack verification declined';
    }
  } else if (payment.provider === 'flutterwave' && process.env.FLUTTERWAVE_SECRET_KEY) {
    const verifyEndpoint = options.providerTransactionId
      ? `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(options.providerTransactionId)}/verify`
      : `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;

    const res = await fetch(verifyEndpoint, {
      headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
    });
    const data = (await res.json()) as {
      status?: string;
      message?: string;
      data?: { status?: string; tx_ref?: string; id?: number; amount?: number; currency?: string };
    };
    const paidAmount = Number(data.data?.amount || 0);
    const paidCurrency = String(data.data?.currency || '').toUpperCase();
    if (
      res.ok &&
      data.status === 'success' &&
      data.data?.status === 'successful' &&
      data.data?.tx_ref === txRef &&
      paidAmount >= Number(payment.amount) &&
      paidCurrency === payment.currency.toUpperCase()
    ) {
      verifiedOk = true;
      providerRef = String(data.data.id || providerRef);
    } else {
      failureReason =
        data.data?.status && data.data.status !== 'successful'
          ? `Flutterwave status: ${data.data.status}`
          : data.message || 'Flutterwave verification declined';
    }
  } else {
    // Sandbox verification path (never trusts browser redirect alone; executed server-side)
    if (options.simulateOutcome === 'fail') {
      verifiedOk = false;
      failureReason = 'Card authorization declined by issuer (sandbox failure simulation).';
    } else {
      verifiedOk = true;
    }
  }

  await db.transaction(async (tx) => {
    const nowExpr = sqlNow();
    if (verifiedOk) {
      await tx.execute(
        `UPDATE payments
         SET status = 'verified',
             verified_server_side = 1,
             webhook_received = CASE WHEN ? = 1 THEN 1 ELSE webhook_received END,
             provider_ref = ?,
             failure_reason = '',
             updated_at = ${nowExpr}
         WHERE id = ?`,
        [options.viaWebhook ? 1 : 0, providerRef, payment.id]
      );

      if (payment.campaign_id) {
        await tx.execute(
          `UPDATE campaigns
           SET payment_status = 'paid',
               status = CASE WHEN status = 'awaiting_payment' THEN 'under_review' ELSE status END,
               updated_at = ${nowExpr}
           WHERE id = ?`,
          [payment.campaign_id]
        );

        await tx.execute(
          `INSERT INTO campaign_activities (campaign_id, actor_type, actor_id, activity_type, summary, details)
           VALUES (?, 'system', ?, 'payment_verified', 'Payment verified on server', ?)`,
          [
            payment.campaign_id,
            payment.user_id,
            `Reference ${payment.tx_ref} (${payment.currency} ${Number(payment.amount).toFixed(2)}) verified via ${payment.provider}.`,
          ]
        );

        await tx.execute(
          `INSERT INTO notifications (user_id, title, message, category, link_path)
           VALUES (?, 'Campaign Payment Verified', ?, 'billing', '/campaigns')`,
          [payment.user_id, `Payment ${payment.tx_ref} was verified. Your promotion campaign is now under review.`]
        );
      }

      if (payment.seo_order_id) {
        await tx.execute(
          `UPDATE seo_orders
           SET payment_status = 'paid',
               order_status = CASE WHEN order_status = 'awaiting_payment' THEN 'queued' ELSE order_status END,
               updated_at = ${nowExpr}
           WHERE id = ?`,
          [payment.seo_order_id]
        );

        await tx.execute(
          `INSERT INTO notifications (user_id, title, message, category, link_path)
           VALUES (?, 'SEO Optimization Order Confirmed', ?, 'billing', '/seo')`,
          [
            payment.user_id,
            `Payment ${payment.tx_ref} was verified. Our specialist team has queued your optimization order.`,
          ]
        );
      }
    } else {
      await tx.execute(
        `UPDATE payments
         SET status = 'failed',
             failure_reason = ?,
             webhook_received = CASE WHEN ? = 1 THEN 1 ELSE webhook_received END,
             updated_at = ${nowExpr}
         WHERE id = ?`,
        [failureReason, options.viaWebhook ? 1 : 0, payment.id]
      );

      if (payment.campaign_id) {
        await tx.execute(
          `UPDATE campaigns SET payment_status = 'failed', updated_at = ${nowExpr} WHERE id = ?`,
          [payment.campaign_id]
        );
      }
      if (payment.seo_order_id) {
        await tx.execute(
          `UPDATE seo_orders SET payment_status = 'failed', updated_at = ${nowExpr} WHERE id = ?`,
          [payment.seo_order_id]
        );
      }

      await tx.execute(
        `INSERT INTO notifications (user_id, title, message, category, link_path)
         VALUES (?, 'Payment Failed', ?, 'billing', '/profile')`,
        [payment.user_id, `Payment ${payment.tx_ref} could not be verified: ${failureReason}`]
      );
    }
  });

  const updated = await db.queryOne(`SELECT * FROM payments WHERE id = ?`, [payment.id]);
  return { payment: updated, alreadyVerified: false, verified: verifiedOk, failureReason };
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyWebhookSignature(provider: string, rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
  if (provider === 'paystack') {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const sig = String(headers['x-paystack-signature'] || '');
    if (!secret) return false;
    const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    return timingSafeEqualStr(sig, expected);
  }
  if (provider === 'flutterwave') {
    const expectedHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
    const sig = String(headers['verif-hash'] || '');
    return Boolean(expectedHash && timingSafeEqualStr(sig, expectedHash));
  }
  return false;
}
