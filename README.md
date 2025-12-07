# X Profile Recruiter Analyzer

A Flask application that serves a website for technical recruiters. It reads users from extracted_users.json, scrapes their X (Twitter) profiles using the X API Python SDK (xdk), analyzes relevance to input job description using xAI Grok API, and displays results.

## Setup

1. Install dependencies:
   ```
   uv sync
   ```
   Or with pip:
   ```
   python3 -m pip install -e .
   ```

2. Environment variables:
   Create `.env` from `.env.example` and set:
   - `X_BEARER_TOKEN`: Bearer token from X Developer Portal (for app-only authentication)
   - `XAI_API_KEY`: API key from console.x.ai for Grok API

3. Run the application:
   ```
   uv run backend/main.py
   ```
   Or:
   ```
   cd backend && python3 main.py
   ```

4. Open http://localhost:8080 in browser.

## Usage

- Enter job description in the form.
- Submit to analyze up to 10 candidates from `extracted_users.json`.
- App scrapes X profiles (name-based search), gets bio and recent tweets.
- Uses Grok to analyze relevance.
- Displays results with profile links and analysis summaries.

## Files

- `backend/x_scraper.py`: Handles X API interactions using xdk library.
- `backend/x_analyzer.py`: Uses OpenAI-compatible client for xAI Grok API analysis.
- `backend/main.py`: Flask app serving website and orchestration.
- `templates/`: HTML templates for UI.

## Notes

- Requires valid API keys; without them, scraping/analysis will fail gracefully.
- Limited to first 10 users for demo; adjust in main.py.
- Profiles may not match exactly due to name-based search; enhance with more logic if needed.
- xAI API model: "grok-beta" (update if changed).
