# Cost Management Protocol

## Before Every Paid Operation
1. Estimate the cost
2. If >$1: explicitly ask user for confirmation
3. If >$10: show detailed breakdown and alternatives

## After Every Paid Operation
Report:
- Action performed
- Actual cost
- Credits used (if applicable)
- Running daily total

## Cost Awareness
- Apify scraping: ~$0.005/result
- Email sending: ~$0.0004/email (Brevo)
- Instagram DM: ~$0.016/message
- WhatsApp instance: ~$2/month
- AI model costs: track token usage

## Daily Limits
- Default daily limit: $10
- Override via preferences.yaml: `daily_cost_limit`
- Warn at 80% of limit
- Hard stop at 100% (require explicit override)
