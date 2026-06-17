"""
Provider Simulation for Testing

This script simulates provider behavior for testing:
- Registers a test provider
- Goes online every 10 seconds
- Accepts incoming jobs automatically
- Updates location every 5 seconds
- Progresses through job statuses

Usage:
    python test_provider_simulation.py --provider_id PROV-XXXXX --auto_accept
"""

import asyncio
import requests
import time
import argparse
from datetime import datetime
import random
import json

BASE_URL = "http://localhost:8000"
API_V1 = f"{BASE_URL}/api/v1"

class ProviderSimulator:
    def __init__(self, provider_id=None):
        self.provider_id = provider_id
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json"
        })
        self.is_running = False
        self.current_job = None

    def set_provider_id(self, provider_id):
        """Set provider ID for API calls"""
        self.provider_id = provider_id
        self.session.headers.update({
            "X-Provider-ID": provider_id
        })

    def register_provider(self, name="Test Provider", phone="+923001234567"):
        """Register a new provider account"""
        try:
            response = self.session.post(
                f"{API_V1}/provider/register",
                json={
                    "name": name,
                    "phone": phone,
                    "service": "AC Installation & Repair",
                    "hourly_rate": 3000,
                    "experience_yrs": 5,
                    "fcm_token": f"test-token-{int(time.time())}",
                }
            )
            response.raise_for_status()
            data = response.json()
            self.provider_id = data['profile']['provider_id']
            self.set_provider_id(self.provider_id)
            print(f"✅ Registered provider: {self.provider_id}")
            print(json.dumps(data, indent=2))
            return data
        except Exception as err:
            print(f"❌ Registration failed: {err}")
            raise

    def update_availability(self, is_available=True):
        """Toggle provider availability"""
        try:
            response = self.session.post(
                f"{API_V1}/provider/status",
                json={"is_available": is_available}
            )
            response.raise_for_status()
            status_text = "🟢 Online" if is_available else "🔴 Offline"
            print(f"{status_text}")
            return response.json()
        except Exception as err:
            print(f"❌ Status update failed: {err}")

    def get_assigned_jobs(self):
        """Fetch assigned jobs"""
        try:
            response = self.session.get(f"{API_V1}/provider/jobs")
            response.raise_for_status()
            data = response.json()
            return data.get('jobs', [])
        except Exception as err:
            print(f"❌ Failed to fetch jobs: {err}")
            return []

    def respond_to_job(self, booking_id, action="accept"):
        """Accept or reject a job"""
        try:
            response = self.session.post(
                f"{API_V1}/provider/jobs/{booking_id}/respond",
                json={"action": action}
            )
            response.raise_for_status()
            action_text = "✅ Accepted" if action == "accept" else "❌ Rejected"
            print(f"{action_text} job {booking_id}")
            return response.json()
        except Exception as err:
            print(f"❌ Job response failed: {err}")

    def update_job_status(self, booking_id, status):
        """Update job status progression"""
        try:
            response = self.session.post(
                f"{API_V1}/provider/jobs/{booking_id}/status",
                json={"status": status}
            )
            response.raise_for_status()
            print(f"📍 Job status → {status}")
            return response.json()
        except Exception as err:
            print(f"❌ Status update failed: {err}")

    def update_location(self, latitude, longitude, booking_id=None):
        """Send location update"""
        try:
            payload = {
                "latitude": latitude,
                "longitude": longitude,
            }
            if booking_id:
                payload["booking_id"] = booking_id

            response = self.session.post(
                f"{API_V1}/provider/location",
                json=payload
            )
            response.raise_for_status()
            print(f"📡 Location: {latitude:.4f}, {longitude:.4f}")
            return response.json()
        except Exception as err:
            print(f"⚠️  Location update failed: {err}")

    def confirm_booking(self, booking_id, scheduled_time="In 30 minutes"):
        """Confirm booking with scheduled time"""
        try:
            response = self.session.post(
                f"{API_V1}/{booking_id}/confirm",
                json={"scheduled_time": scheduled_time}
            )
            response.raise_for_status()
            print(f"✅ Confirmed booking {booking_id}")
            return response.json()
        except Exception as err:
            print(f"❌ Confirm booking failed: {err}")

    async def simulate_work_loop(self, accept_jobs=True, update_location=True):
        """Main simulation loop"""
        print("\n🚀 Starting provider simulation...")
        self.is_running = True

        try:
            while self.is_running:
                # Check for new jobs
                jobs = self.get_assigned_jobs()
                pending_jobs = [j for j in jobs if j['status'] in ['pending', 'pending_acceptance']]

                # Auto-accept jobs if requested
                if accept_jobs and pending_jobs:
                    for job in pending_jobs:
                        self.respond_to_job(job['booking_id'], 'accept')
                        self.current_job = job['booking_id']

                # Update location if we have an active job
                if update_location and self.current_job:
                    # Simulate movement towards customer
                    base_lat = 33.6844
                    base_lon = 73.0479
                    lat = base_lat + random.uniform(-0.01, 0.01)
                    lon = base_lon + random.uniform(-0.01, 0.01)
                    self.update_location(lat, lon, self.current_job)

                # Progress job status
                active_jobs = [j for j in jobs if j['status'] in ['accepted', 'confirmed', 'on_the_way', 'arrived', 'in_progress']]
                if active_jobs:
                    job = active_jobs[0]
                    
                    if job['status'] == 'accepted':
                        # Auto-confirm after accepting
                        self.confirm_booking(job['booking_id'])
                    else:
                        status_progression = {
                            'confirmed': 'on_the_way',
                            'on_the_way': 'arrived',
                            'arrived': 'in_progress',
                            'in_progress': 'completed'
                        }
                        next_status = status_progression.get(job['status'])
                        if next_status:
                            # Only auto-progress every 30 seconds for demo
                            if random.random() > 0.8:
                                self.update_job_status(job['booking_id'], next_status)
                                if next_status == 'completed':
                                    self.current_job = None

                # Wait before next loop
                await asyncio.sleep(5)

        except KeyboardInterrupt:
            print("\n⏹️  Simulation stopped")
            self.is_running = False

    def run(self, accept_jobs=True, update_location=True):
        """Run simulation (sync wrapper)"""
        asyncio.run(self.simulate_work_loop(accept_jobs, update_location))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate provider behavior")
    parser.add_argument("--register", action="store_true", help="Register new provider")
    parser.add_argument("--provider_id", type=str, help="Provider ID to use")
    parser.add_argument("--name", type=str, default="Test Provider", help="Provider name")
    parser.add_argument("--auto_accept", action="store_true", help="Auto-accept jobs")
    parser.add_argument("--auto_location", action="store_true", help="Auto-update location")

    args = parser.parse_args()

    simulator = ProviderSimulator()

    # Register or use existing
    if args.register:
        simulator.register_provider(name=args.name)
    elif args.provider_id:
        simulator.set_provider_id(args.provider_id)
    else:
        print("⚠️  Provide --register or --provider_id")
        parser.print_help()
        exit(1)

    # Go online
    simulator.update_availability(True)

    # Run simulation
    simulator.run(
        accept_jobs=args.auto_accept,
        update_location=args.auto_location
    )
