from xdk.oauth2_auth import OAuth2PKCEAuth
from dotenv import load_dotenv
import os
from urllib.parse import urlparse
import webbrowser

load_dotenv()

# Step 1: Create PKCE instance
auth = OAuth2PKCEAuth(
    client_id=os.getenv('X_CLIENT_ID'),
    redirect_uri="http://localhost:8080/callback",
    scope="tweet.read users.read offline.access"
)
# Step 2: Get authorization URL
auth_url = auth.get_authorization_url()
print(f"Visit this URL to authorize: {auth_url}")
webbrowser.open(auth_url)
# Step 3: Handle callback (in a real app, use a web framework like Flask)
# Assume callback_url = "http://localhost:8080/callback?code=AUTH_CODE_HERE"
callback_url = input("Paste the full callback URL here: ")
# Step 4: Exchange code for tokens
tokens = auth.fetch_token(authorization_response=callback_url)
access_token = tokens["access_token"]
refresh_token = tokens["refresh_token"]  # Store for renewal
# Step 5: Create client
# Option 1: Use bearer_token (OAuth2 access tokens work as bearer tokens)
client = Client(bearer_token=access_token)
# Option 2: Pass the full token dict for automatic refresh support
# client = Client(token=tokens)
