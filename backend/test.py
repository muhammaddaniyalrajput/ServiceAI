import requests
r = requests.post("http://127.0.0.1:8000/api/v1/analyze-request", json={"user_id": "test", "text": "need a plumber"})
print(r.status_code)
print(r.text)
