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

export interface FlutterwaveCredentials {
  publicKey: string;
  secretKey: string;
  encryptionKey: string;
  webhookHash: string;
}

export async function getFlutterwaveCredentials(): Promise<FlutterwaveCredentials> {
  const rows = await db.queryAll<{ key: string; value: string }>(
    `SELECT key, value FROM system_settings
     WHERE key IN ('flutterwave_public_key', 'flutterwave_secret_key', 'flutterwave_encryption_key', 'flutterwave_webhook_hash')`
  );
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.key, String(r.value || '').trim());
  }
  return {
    publicKey: map.get('flutterwave_public_key') || process.env.FLUTTERWAVE_PUBLIC_KEY?.trim() || '',
    secretKey: map.get('flutterwave_secret_key') || process.env.FLUTTERWAVE_SECRET_KEY?.trim() || '',
    encryptionKey: map.get('flutterwave_encryption_key') || process.env.FLUTTERWAVE_ENCRYPTION_KEY?.trim() || '',
    webhookHash: map.get('flutterwave_webhook_hash') || process.env.FLUTTERWAVE_WEBHOOK_HASH?.trim() || '',
  };
}

export async function getActiveDefaultProvider(): Promise<PaymentProviderName> {
  const row = await db.queryOne<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'payment_default_provider'`
  );
  const v = row?.value;
  if (v === 'paystack' || v === 'flutterwave' || v === 'sandbox') return v;
  return 'flutterwave';
}

export async function getPaymentGatewayStatus() {
  const [defaultProvider, flw] = await Promise.all([
    getActiveDefaultProvider(),
    getFlutterwaveCredentials(),
  ]);
  return {
    defaultProvider,
    flutterwaveConfigured: Boolean(flw.secretKey),
    flutterwaveHasPublicKey: Boolean(flw.publicKey),
    flutterwaveHasEncryptionKey: Boolean(flw.encryptionKey),
    flutterwaveHasWebhookHash: Boolean(flw.webhookHash),
    paystackConfigured: Boolean(process.env.PAYSTACK_SECRET_KEY?.trim()),
  };
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

  const flw = params.provider === 'flutterwave' ? await getFlutterwaveCredentials() : null;
  if (params.provider === 'flutterwave' && flw?.secretKey) {
    const brandRows = await db.queryAll<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings WHERE key IN ('site_app_name', 'site_logo_url')`
    );
    const brandMap = new Map(brandRows.map((r) => [r.key, String(r.value || '').trim()]));
    const siteTitle = brandMap.get('site_app_name') || 'Vantage Reach';
    const rawLogo = brandMap.get('site_logo_url') || '';
    const safeHttpsLogo = rawLogo.startsWith('https://') ? rawLogo : undefined;

    const res = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${flw.secretKey}`,
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
          title: siteTitle,
          description: params.description,
          ...(safeHttpsLogo ? { logo: safeHttpsLogo } : {}),
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

  // Test / Sandbox Checkout Mode when live merchant keys are not set in environment or Admin settings
  const payment = await db.queryOne(`SELECT * FROM payments WHERE id = ?`, [paymentId]);
  return {
    payment,
    mode: 'sandbox_checkout' as const,
    checkoutUrl: null,
    requiresServerVerify: true,
    notice:
      params.provider === 'sandbox'
        ? 'Using Sandbox Checkout for server-side verification testing.'
        : `${params.provider.toUpperCase()} live secret key is not connected yet. Add your ${params.provider.toUpperCase()} keys in Admin Console → Flutterwave & APIs (or server environment) to accept live payments, or use Sandbox Verification below.`,
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
  let stillPending = false;
  let failureReason = '';
  let providerRef = options.providerTransactionId || `VER-${txRef}`;
  const flw = payment.provider === 'flutterwave' ? await getFlutterwaveCredentials() : null;

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
  } else if (payment.provider === 'flutterwave' && flw?.secretKey) {
    const verifyEndpoint = options.providerTransactionId
      ? `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(options.providerTransactionId)}/verify`
      : `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;

    const res = await fetch(verifyEndpoint, {
      headers: { Authorization: `Bearer ${flw.secretKey}` },
    });
    const data = (await res.json()) as {
      status?: string;
      message?: string;
      data?: { status?: string; tx_ref?: string; id?: number; amount?: number; currency?: string };
    };
    const paidAmount = Number(data.data?.amount || 0);
    const paidCurrency = String(data.data?.currency || '').toUpperCase();
    const flwStatus = String(data.data?.status || '').toLowerCase();
    if (
      res.ok &&
      data.status === 'success' &&
      flwStatus === 'successful' &&
      data.data?.tx_ref === txRef &&
      paidAmount >= Number(payment.amount) &&
      paidCurrency === payment.currency.toUpperCase()
    ) {
      verifiedOk = true;
      providerRef = String(data.data.id || providerRef);
    } else if (flwStatus === 'failed' || flwStatus === 'cancelled' || options.simulateOutcome === 'fail') {
      failureReason = `Flutterwave status: ${data.data?.status || 'failed'}`;
    } else {
      stillPending = true;
      failureReason =
        data.message ||
        'Payment has not been completed on Flutterwave yet. Complete checkout first, then verify again.';
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

  if (stillPending && !verifiedOk) {
    return { payment, alreadyVerified: false, verified: false, pending: true, failureReason };
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

        const cmpPkg = await tx.queryOne<{ code: string; name: string; duration_days: number }>(
          `SELECT p.code, p.name, c.duration_days
           FROM campaigns c
           LEFT JOIN packages p ON p.id = c.package_id
           WHERE c.id = ?`,
          [payment.campaign_id]
        );
        const isVipPkg = Boolean(cmpPkg && (cmpPkg.code === 'vip_membership' || cmpPkg.code.startsWith('vip_')));
        if (isVipPkg) {
          const days = Math.max(1, Number(cmpPkg?.duration_days || 30));
          const vipExpiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
          await tx.execute(
            `UPDATE user_profiles
             SET vip_status = 'active', vip_expires_at = ?, updated_at = ${nowExpr}
             WHERE user_id = ?`,
            [vipExpiresAt, payment.user_id]
          );
          await tx.execute(
            `INSERT INTO notifications (user_id, title, message, category, link_path)
             VALUES (?, ?, ?, 'billing', '/intelligence')`,
            [
              payment.user_id,
              `Welcome to ${cmpPkg?.name || 'Creator VIP Club'}!`,
              `Your $1 Creator VIP Club membership (${payment.tx_ref}) is now active! Your video has been placed in our priority discovery queue.`,
            ]
          );
        } else {
          await tx.execute(
            `INSERT INTO notifications (user_id, title, message, category, link_path)
             VALUES (?, 'Campaign Payment Verified', ?, 'billing', '/campaigns')`,
            [payment.user_id, `Payment ${payment.tx_ref} was verified. Your promotion campaign is now under review.`]
          );
        }
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

export async function verifyWebhookSignature(
  provider: string,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>
): Promise<boolean> {
  if (provider === 'paystack') {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const sig = String(headers['x-paystack-signature'] || '');
    if (!secret) return false;
    const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    return timingSafeEqualStr(sig, expected);
  }
  if (provider === 'flutterwave') {
    const flw = await getFlutterwaveCredentials();
    const expectedHash = flw.webhookHash;
    const sig = String(headers['verif-hash'] || '');
    return Boolean(expectedHash && timingSafeEqualStr(sig, expectedHash));
  }
  return false;
}
