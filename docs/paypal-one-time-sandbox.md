# PayPal access payment: sandbox experiment

Separate from the old recurring subscription. Uses Orders v2 CAPTURE and the existing wallet ledger, recovery, verified webhook and access-period accumulation. Payment method is PAYPAL_ONETIME so subscription reconciliation cannot overwrite prepaid periods.

Enable only in Railway test: P2P_PAYPAL_ONETIME_ENABLED=true with P2P_PAYPAL_MODE=sandbox and dedicated sandbox credentials. The config explicitly refuses live mode, including when LIVE_VERIFIED is set. Production remains unchanged.

The PayPal button shares the Google/Apple plan selector and busy lock. Server-authenticated create/capture endpoints verify user ownership, order reference, EUR amount, PayPal payment source and completed capture. Approval alone does not activate access. A pending/ambiguous order is retained rather than replaced. Closing the PayPal window does not imply cancellation of an authorized payment.

Automated checks cover all plans, accumulation, repeated capture/recovery and sandbox-only gating. Real sandbox login/approval must still be exercised with the user's sandbox personal buyer before any live rollout. Do not infer live merchant recovery from sandbox success.

Reference: https://developer.paypal.com/studio/checkout/standard/integrate
