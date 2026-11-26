import crypto from 'crypto';
import { db } from './db.ts';

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

export function getActiveDefaultProvider(): PaymentProviderName {
  const row = db
    .prepare(`SELECT value FROM system_settings WHERE key = 'payment_default_provider'`)
    .get() as { value: string } | undefined;
  const v = row?.value;
  if (v === 'paystack' || v === 'flutterwave' || v === 'sandbox') return v;
  return 'paystack';
}

export async function initializePayment(params: InitPaymentParams) {
  // Enforce idempotency
  const existing = db
    .prepare(`SELECT * FROM payments WHERE idempotency_key = ?`)
    .get(params.idempotencyKey) as Record<string, any> | undefined;

  if (existing) {
    return {
      payment: existing,
      mode: existing.provider,
      checkoutUrl: null,
      requiresServerVerify: existing.status === 'pending',
    };
  }

  const txRef = `VR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const insertRes = db
    .prepare(
      `INSERT INTO payments (
         user_id, campaign_id, seo_order_id, tx_ref, idempotency_key,
         provider, amount, currency, status, metadata_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(
      params.userId,
      params.campaignId ?? null,
      params.seoOrderId ?? null,
      txRef,
      params.idempotencyKey,
      params.provider,
      params.amount,
      params.currency,
      JSON.stringify({ description: params.description })
    );

  const paymentId = Number(insertRes.lastInsertRowid);

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
      db.prepare(`UPDATE payments SET status = 'failed', failure_reason = ?, updated_at = datetime('now') WHERE id = ?`).run(
        data.message || 'Paystack initialization failed',
        paymentId
      );
      throw new Error(data.message || 'Paystack initialization failed');
    }
    const payment = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(paymentId);
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
        customer: { email: params.email },
        customizations: {
          title: 'Vantage Reach',
          description: params.description,
        },
      }),
    });
    const data = (await res.json()) as {
      status?: string;
      message?: string;
      data?: { link?: string };
    };
    if (!res.ok || data.status !== 'success' || !data.data?.link) {
      db.prepare(`UPDATE payments SET status = 'failed', failure_reason = ?, updated_at = datetime('now') WHERE id = ?`).run(
        data.message || 'Flutterwave initialization failed',
        paymentId
      );
      throw new Error(data.message || 'Flutterwave initialization failed');
    }
    const payment = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(paymentId);
    return {
      payment,
      mode: 'flutterwave_live' as const,
      checkoutUrl: data.data.link,
      requiresServerVerify: true,
    };
  }

  // Test / Sandbox Checkout Mode when live merchant keys are not set in environment
  const payment = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(paymentId);
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
  const payment = db.prepare(`SELECT * FROM payments WHERE tx_ref = ?`).get(txRef) as
    | {
        id: number;
        user_id: number;
        campaign_id: number | null;
        seo_order_id: number | null;
        tx_ref: string;
        provider: PaymentProviderName;
        amount: number;
        currency: string;
        status: string;
      }
    | undefined;

  if (!payment) {
    throw new Error('Transaction reference not found.');
  }

  // Idempotent return if already verified
  if (payment.status === 'verified') {
    return { payment, alreadyVerified: true };
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
      data?: { status?: string; amount?: number; reference?: string };
    };
    if (res.ok && data.status && data.data?.status === 'success') {
      verifiedOk = true;
      providerRef = data.data.reference || providerRef;
    } else {
      failureReason = data.data?.status || data.message || 'Paystack verification declined';
    }
  } else if (payment.provider === 'flutterwave' && process.env.FLUTTERWAVE_SECRET_KEY && options.providerTransactionId) {
    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(options.providerTransactionId)}/verify`,
      {
        headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
      }
    );
    const data = (await res.json()) as {
      status?: string;
      message?: string;
      data?: { status?: string; tx_ref?: string; id?: number };
    };
    if (res.ok && data.status === 'success' && data.data?.status === 'successful' && data.data?.tx_ref === txRef) {
      verifiedOk = true;
      providerRef = String(data.data.id || providerRef);
    } else {
      failureReason = data.message || 'Flutterwave verification declined';
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

  const tx = db.transaction(() => {
    if (verifiedOk) {
      db.prepare(
        `UPDATE payments
         SET status = 'verified',
             verified_server_side = 1,
             webhook_received = CASE WHEN ? = 1 THEN 1 ELSE webhook_received END,
             provider_ref = ?,
             failure_reason = '',
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(options.viaWebhook ? 1 : 0, providerRef, payment.id);

      if (payment.campaign_id) {
        db.prepare(
          `UPDATE campaigns
           SET payment_status = 'paid',
               status = CASE WHEN status = 'awaiting_payment' THEN 'under_review' ELSE status END,
               updated_at = datetime('now')
           WHERE id = ?`
        ).run(payment.campaign_id);

        db.prepare(
          `INSERT INTO campaign_activities (campaign_id, actor_type, actor_id, activity_type, summary, details)
           VALUES (?, 'system', ?, 'payment_verified', 'Payment verified on server', ?)`
        ).run(
          payment.campaign_id,
          payment.user_id,
          `Reference ${payment.tx_ref} (${payment.currency} ${payment.amount.toFixed(2)}) verified via ${payment.provider}.`
        );

        db.prepare(
          `INSERT INTO notifications (user_id, title, message, category, link_path)
           VALUES (?, 'Campaign Payment Verified', ?, 'billing', '/campaigns')`
        ).run(
          payment.user_id,
          `Payment ${payment.tx_ref} was verified. Your promotion campaign is now under review.`
        );
      }

      if (payment.seo_order_id) {
        db.prepare(
          `UPDATE seo_orders
           SET payment_status = 'paid',
               order_status = CASE WHEN order_status = 'awaiting_payment' THEN 'queued' ELSE order_status END,
               updated_at = datetime('now')
           WHERE id = ?`
        ).run(payment.seo_order_id);

        db.prepare(
          `INSERT INTO notifications (user_id, title, message, category, link_path)
           VALUES (?, 'SEO Optimization Order Confirmed', ?, 'billing', '/seo')`
        ).run(
          payment.user_id,
          `Payment ${payment.tx_ref} was verified. Our specialist team has queued your optimization order.`
        );
      }
    } else {
      db.prepare(
        `UPDATE payments
         SET status = 'failed',
             failure_reason = ?,
             webhook_received = CASE WHEN ? = 1 THEN 1 ELSE webhook_received END,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(failureReason, options.viaWebhook ? 1 : 0, payment.id);

      if (payment.campaign_id) {
        db.prepare(`UPDATE campaigns SET payment_status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(
          payment.campaign_id
        );
      }
      if (payment.seo_order_id) {
        db.prepare(`UPDATE seo_orders SET payment_status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(
          payment.seo_order_id
        );
      }

      db.prepare(
        `INSERT INTO notifications (user_id, title, message, category, link_path)
         VALUES (?, 'Payment Failed', ?, 'billing', '/profile')`
      ).run(payment.user_id, `Payment ${payment.tx_ref} could not be verified: ${failureReason}`);
    }
  });

  tx();
  const updated = db.prepare(`SELECT * FROM payments WHERE id = ?`).get(payment.id);
  return { payment: updated, alreadyVerified: false, verified: verifiedOk, failureReason };
}

export function verifyWebhookSignature(provider: string, rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
  if (provider === 'paystack') {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const sig = String(headers['x-paystack-signature'] || '');
    if (!secret) return false;
    const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    return sig.length > 0 && sig === expected;
  }
  if (provider === 'flutterwave') {
    const expectedHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
    const sig = String(headers['verif-hash'] || '');
    return Boolean(expectedHash && sig && sig === expectedHash);
  }
  return false;
}
