# How to get your Cloudflare Tunnel Token

To connect your local Docker app to the internet, follow these steps:

1. **Log in to Cloudflare**: Go to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. **Access Tunnels**:
   - On the left sidebar, go to **Networks** -> **Tunnels**.
   - Click **Create a tunnel**.
3. **Configure Tunnel**:
   - Choose **Cloudflared** (the default).
   - Give it a name (e.g., `SEO-Agent`).
   - Save the tunnel.
4. **Get the Token**:
   - You will see a page with "Install and run a connector".
   - Look for the command under **Docker**.
   - It will look something like this: `docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <LONG_STRING_OF_CHARACTERS>`
   - **Copy ONLY the long string of characters** (the Token).
5. **Set up Routing**:
   - After copying the token, click **Next**.
   - Under **Public Hostnames**, add the domain or subdomain you want to use (e.g., `seo.yourdomain.com`).
   - Under **Service**, set:
     - **Type**: `HTTP`
     - **URL**: `seo-agent:8501` (This matches the service name in our `docker-compose.yml`).
   - Save the hostname.

**Send me the Token once you have it!**
