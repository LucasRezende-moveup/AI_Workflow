# Deployment Guide: Sharing the SEO AI Agent

To make this project available to other people in your company, you have several options depending on your technical infrastructure and security requirements.

## Option 1: Quick Sharing on Local Network (Internal)
If you just want a few teammates in the same office/network to use it:
1. **Find your Local IP**: Run `ipconfig` (Windows) or `ifconfig` (Mac/Linux) and find your IPv4 address (e.g., `192.168.1.15`).
2. **Run Streamlit with address flag**:
   ```bash
   streamlit run app.py --server.address 0.0.0.0 --server.port 8501
   ```
3. **Share the Link**: Others can access it at `http://192.168.1.15:8501`.
   > [!WARNING]
   > Your computer must stay on and the terminal must be running for the app to work.

## Option 2: Internal Server / VPS (Recommended)
Host the app on a dedicated company server so it's always online.

### 1. Requirements
- A server (Windows Server, Linux/Ubuntu, etc.)
- Python installed
- The code repository (Git recommended)

### 2. Setup (Docker - Most Robust)
A Docker container ensures the app runs the same way everywhere.

**Step-by-Step Deployment:**
1. **Move files**: Ensure `Dockerfile`, `docker-compose.yml`, and `requirements.txt` are in the project folder.
2. **Configuration**: Your `.env`, `client_secret.json`, and `token.pickle` will be automatically linked to the container.
3. **Run the Command**:
   ```bash
   docker-compose up -d --build
   ```
4. **Access**: The app will be available at `http://localhost:8501` (or your server's IP).

**Useful Commands:**
- `docker-compose stop`: Stops the application.
- `docker-compose logs -f`: Shows real-time errors/logs.
- `docker-compose ps`: Checks if the app is healthy.

## Option 3: Cloud Hosting (AWS, GCP, Azure, Heroku)
Professional hosting for high availability.
- **Google Cloud Run**: Highly recommended if you are already using Google Search Console. It scales to zero when not in use (cost-effective).
- **Streamlit Community Cloud**: Easiest, but requires you to host code on GitHub. Use "Private" repositories for company data.

---

## 🔒 Security Checklist (CRITICAL)
Before sharing the app, ensure these items are protected:

1. **`.env` File**: Never commit this to Git. In a production environment, use "Secrets" or "Environment Variables" provided by the host.
2. **`client_secret.json`**: This file contains your GSC credentials. Ensure only the server has access to it.
3. **`token.pickle`**: This file stores your user session. If multiple people are using the app, consider using a database or Google's OAuth 2.0 flow properly so they can log in via their *own* Google accounts.
4. **Authentication**: Streamlit doesn't have built-in user logins by default. Consider adding a simple login screen or using a service like Auth0 if you need to restrict access.

---

## Next Steps
If you'd like me to create the `Dockerfile` or a `requirements.txt` update for any of these options, just let me know!
