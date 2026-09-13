# Terms of Service

**Effective date:** 2026-09-14
**App:** Nexus Trade Mobile
**Developer:** jvrboy (personal-use app)

## 1. Acceptance of Terms

By installing, accessing, or using Nexus Trade Mobile ("the App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not install or use the App.

## 2. Description of Service

Nexus Trade Mobile is a client application that connects to a self-hosted FastAPI backend ("the Backend") which you configure and operate yourself. The App displays market analysis signals, account metrics, and learning-system diagnostics produced by the Backend. The App is provided for **personal, educational, and research purposes only**.

## 3. No Financial Advice

**The App is NOT a financial advisor, broker, or regulated financial service.** Nothing displayed by the App — including signals, strength scores, entry/stop/target levels, model predictions, or risk metrics — constitutes financial, investment, trading, or other advice. You should not interpret any content from the App as a recommendation to buy, sell, or hold any financial instrument.

All trading decisions are yours alone. You should consult a licensed financial advisor before making any investment decisions.

## 4. Risk Disclosure

Forex, CFD, and leveraged trading involve substantial risk of loss and are not suitable for all investors. You may lose more than your initial deposit. Past performance — including any backtest results, win-rate statistics, or profit-factor metrics shown by the App — is **not** indicative of future results.

The Backend's machine-learning models (RL, Neural, Deep Neural) are experimental. They may produce incorrect predictions. Model drift, anomaly guard activations, and shadow deployment promotions may occur without your direct awareness. You are responsible for monitoring the App and Backend for unexpected behavior.

## 5. No Warranty

The App is provided "AS IS" and "AS AVAILABLE", without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, non-infringement, or that the App will be error-free, uninterrupted, or accurate.

The developer (jvrboy) explicitly disclaims all warranties and shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the App, including but not limited to:

- Trading losses
- Loss of profit
- Loss of data
- Unauthorized access to API keys stored on your Backend
- Backend downtime or misconfiguration
- Inaccurate signals or model predictions
- Failure of the kill-switch mechanism

## 6. User Responsibilities

You are solely responsible for:

- Configuring and operating your own Backend.
- Securing your Backend (the App supports bearer-token auth and per-IP rate limiting — see `backend/security.py`).
- Securing your provider API keys (the App supports AES-256-GCM encryption at rest — see `backend/security.py`).
- Reviewing the Backend's safety state, anomaly guard status, and broker configuration before enabling any live execution.
- Complying with all applicable laws, including financial regulations in your jurisdiction.
- Ensuring your use of any third-party API (Gemini, OpenAI, Deriv, Finnhub, etc.) complies with that provider's terms of service.

## 7. Limitation of Liability

To the maximum extent permitted by law, the developer shall not be liable for any damages arising from your use of the App, even if advised of the possibility of such damages. The App is provided free of charge; no money was paid by you for the App or these Terms, so the developer's liability is limited accordingly.

## 8. Intellectual Property

The App is licensed under the MIT License (see `LICENSE`). The MIT License applies to the source code; these Terms apply to your use of the compiled/built App.

## 9. Modifications to Terms

The developer may modify these Terms at any time. Changes will be committed to this file in the public GitHub repository at <https://github.com/jvrboy/nexus-trade-mobile>. The "Effective date" at the top will be updated. Continued use of the App after changes constitutes acceptance of the new Terms.

## 10. Termination

You may stop using the App at any time by uninstalling it. The developer may discontinue the App at any time without notice.

## 11. Governing Law

These Terms are governed by the laws of your jurisdiction of residence, without regard to conflict-of-law principles.

## 12. Contact

Open an issue at <https://github.com/jvrboy/nexus-trade-mobile/issues> for any questions about these Terms.
