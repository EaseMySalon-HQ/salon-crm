/**
 * PREP: Webhook signature verification placeholder.
 *
 * When integrating Stripe / Razorpay / custom webhooks, verify HMAC or provider headers here
 * before processing the body. Never trust webhook payloads without signature checks.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function verifyWebhookSignaturePlaceholder(req, res, next) {
  // Example (Stripe): const sig = req.headers['stripe-signature']; stripe.webhooks.constructEvent(...)
  // Until configured, pass through for internal test routes only.
  next();
}

module.exports = {
  verifyWebhookSignaturePlaceholder,
};
