import os
import json
from types import SimpleNamespace
from typing import Dict, Optional, Any
from dotenv import load_dotenv
from xdk import Client

load_dotenv()

class XScraper:
    def __init__(self, client: Client):
        self.client = client

    def find_x_user(self, query: str) -> Optional[Any]:
        """
        Search for X user by name query.
        Returns the first verified user or the first result.
        """
        try:
            # todo: handle multiple users?
            users = self.client.users.search(query=query, max_results=1)
            return SimpleNamespace(**next(users).data[0])
        except Exception as e:
            print(f"Error searching user {query}: {e}")
            return None

    def scrape_user_data(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Find user on X and scrape profile and recent tweets.
        """
        user = self.find_x_user(name)
        if not user:
            return None

        print(f"user: {name}: {user}")

        # Get detailed user profile
        profile = self.client.users.get_by_id(id=user.id)

        print(f"profile for {name} : {profile}")

        # Get recent tweets
        tweets_response = next(self.client.users.get_posts(
            id=user.id,
            max_results=100,
        ))

        print(f"tweets: {tweets_response}")

        tweets = [tweet["text"] for tweet in tweets_response.data]
        
        return {
            'user': {
                'id': profile.data["id"],
                'username': profile.data["username"],
                'name': profile.data["name"],
            },
            'tweets': tweets
        }
