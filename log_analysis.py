import streamlit as st
import json
import os
import requests
import gzip
import io
import pandas as pd
import re
from datetime import datetime, timedelta
import plotly.express as px

SITES_FILE = "log_sites.json"

def load_sites():
    if os.path.exists(SITES_FILE):
        try:
            with open(SITES_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    # Default initial state
    default = {
        "Moveup Logs": {
            "url": "https://www.em.com.br/apostas/logs/",
            "username": "admin",
            "password": "moveup"
        }
    }
    save_sites(default)
    return default

def save_sites(sites):
    with open(SITES_FILE, "w") as f:
        json.dump(sites, f, indent=4)

@st.cache_data(ttl=3600)
def fetch_log_files(url, username, password):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    }
    try:
        if not url.endswith('/'):
            url += '/'
        response = requests.get(url, auth=(username, password), headers=headers, timeout=10)
        response.raise_for_status()
        
        # Simple regex to find .json.gz links
        pattern = r'href="([^"]+\.json\.gz)"'
        files = re.findall(pattern, response.text)
        
        # Sort files in descending order (newest first)
        files = sorted(list(set(files)), reverse=True)
        return files
    except Exception as e:
        st.error(f"Failed to fetch log list from {url}: {e}")
        return []

@st.cache_data(ttl=3600)
def download_and_parse_logs(base_url, username, password, files_to_download):
    if not base_url.endswith('/'):
        base_url += '/'
        
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    }
    
    all_logs = []
    
    for file_name in files_to_download:
        url = base_url + file_name
        try:
            resp = requests.get(url, auth=(username, password), headers=headers, timeout=30)
            if resp.status_code == 200:
                with gzip.GzipFile(fileobj=io.BytesIO(resp.content)) as f:
                    for line in f:
                        line_str = line.decode('utf-8').strip()
                        # Assuming format: Prefix @cee: {"json": "payload"}
                        if '@cee: ' in line_str:
                            parts = line_str.split('@cee: ', 1)
                            if len(parts) == 2:
                                timestamp_str = parts[0].strip() # "May 10 00:00:14 ip-x-x-x-x b5d25af7bb4b"
                                try:
                                    payload = json.loads(parts[1])
                                    # Add the log file name as a date proxy if needed, or extract from timestamp_str
                                    payload['_source_file'] = file_name
                                    all_logs.append(payload)
                                except json.JSONDecodeError:
                                    continue
        except Exception as e:
            st.warning(f"Failed to download or parse {file_name}: {e}")
            
    return pd.DataFrame(all_logs)


def render_log_analysis_page():
    st.title("🪵 Server Logs Analysis")
    
    sites = load_sites()
    
    with st.expander("⚙️ Manage Log Sources"):
        st.markdown("Add or remove sites to pull logs from.")
        
        # Form to add a new site
        with st.form("add_site_form"):
            col1, col2 = st.columns(2)
            with col1:
                new_site_name = st.text_input("Site Name (e.g., Main Site)")
                new_site_url = st.text_input("Log URL")
            with col2:
                new_site_user = st.text_input("Username")
                new_site_pass = st.text_input("Password", type="password")
                
            submit_add = st.form_submit_button("Add Site")
            if submit_add:
                if new_site_name and new_site_url:
                    sites[new_site_name] = {
                        "url": new_site_url,
                        "username": new_site_user,
                        "password": new_site_pass
                    }
                    save_sites(sites)
                    st.success(f"Added {new_site_name}")
                    st.rerun()
                else:
                    st.error("Site Name and URL are required.")
                    
        # List existing sites to remove
        if sites:
            st.markdown("#### Existing Sites")
            for site_name, config in sites.items():
                c1, c2, c3 = st.columns([3, 5, 1])
                c1.write(f"**{site_name}**")
                c2.write(f"_{config['url']}_")
                if c3.button("Remove", key=f"del_{site_name}"):
                    del sites[site_name]
                    save_sites(sites)
                    st.success(f"Removed {site_name}")
                    st.rerun()

    st.markdown("---")
    
    if not sites:
        st.info("Please add a log source in the settings above to begin.")
        return

    col_site, col_action = st.columns([3, 1])
    with col_site:
        selected_site_name = st.selectbox("Select Log Source", list(sites.keys()))
    
    selected_site = sites[selected_site_name]
    
    files = fetch_log_files(selected_site["url"], selected_site["username"], selected_site["password"])
    
    if not files:
        st.warning("No .json.gz files found at this URL or unable to access.")
        return
        
    st.markdown(f"Found **{len(files)}** log files available.")
    
    # Default to last 28 files
    default_selection = files[:28] if len(files) >= 28 else files
    
    selected_files = st.multiselect("Select Log Files to Analyze", files, default=default_selection)
    
    if st.button("🚀 Load & Analyze Logs", type="primary"):
        if not selected_files:
            st.warning("Please select at least one log file.")
            return
            
        with st.spinner(f"Downloading and parsing {len(selected_files)} log files... This may take a minute."):
            df = download_and_parse_logs(
                selected_site["url"], 
                selected_site["username"], 
                selected_site["password"], 
                selected_files
            )
            
        if df.empty:
            st.error("No valid log data found in the selected files.")
            return
            
        st.session_state['log_df'] = df
        st.success(f"Successfully loaded {len(df):,} log entries.")

    if 'log_df' in st.session_state:
        df = st.session_state['log_df']
        
        st.markdown("---")
        st.subheader("🔎 Filters")
        
        f1, f2, f3 = st.columns(3)
        with f1:
            status_codes = df.get('status', pd.Series()).dropna().unique().tolist()
            selected_status = st.multiselect("Status Code", sorted(status_codes))
        with f2:
            preset_bots = ["Googlebot", "bingbot", "AhrefsBot", "PetalBot", "SemrushBot", "YandexBot"]
            bot_filter = st.selectbox("Quick Bot Filter", ["All", "Any Bot"] + preset_bots)
            custom_ua = st.text_input("Custom User Agent (contains)")
        with f3:
            path_filter = st.text_input("Path/Request (contains)")
            ip_filter = st.text_input("IP Address")
            
        filtered_df = df.copy()
        
        if selected_status:
            filtered_df = filtered_df[filtered_df['status'].isin(selected_status)]
            
        if bot_filter != "All" and 'user_agent' in filtered_df.columns:
            if bot_filter == "Any Bot":
                filtered_df = filtered_df[filtered_df['user_agent'].str.contains('bot|spider|crawler', case=False, na=False)]
            else:
                filtered_df = filtered_df[filtered_df['user_agent'].str.contains(bot_filter, case=False, na=False)]
                
        if custom_ua and 'user_agent' in filtered_df.columns:
            filtered_df = filtered_df[filtered_df['user_agent'].str.contains(custom_ua, case=False, na=False)]
            
        if path_filter and 'request' in filtered_df.columns:
            filtered_df = filtered_df[filtered_df['request'].str.contains(path_filter, case=False, na=False)]
            
        if ip_filter and 'ip' in filtered_df.columns:
            filtered_df = filtered_df[filtered_df['ip'].astype(str).str.contains(ip_filter, na=False)]

        st.info(f"Showing **{len(filtered_df):,}** logs (filtered from {len(df):,})")
        
        # Dashboard Visuals
        st.markdown("### 📊 Metrics")
        
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Total Hits", f"{len(filtered_df):,}")
        
        if 'status' in filtered_df.columns:
            errors_404 = len(filtered_df[filtered_df['status'] == '404'])
            m2.metric("404 Errors", f"{errors_404:,}")
            errors_5xx = len(filtered_df[filtered_df['status'].str.startswith('5', na=False)])
            m3.metric("5xx Errors", f"{errors_5xx:,}")
            
        if 'ip' in filtered_df.columns:
            unique_ips = filtered_df['ip'].nunique()
            m4.metric("Unique IPs", f"{unique_ips:,}")
            
        st.markdown("---")
        c1, c2 = st.columns(2)
        
        with c1:
            st.markdown("#### Status Code Distribution")
            if 'status' in filtered_df.columns and not filtered_df.empty:
                status_counts = filtered_df['status'].value_counts().reset_index()
                status_counts.columns = ['Status', 'Count']
                fig_status = px.pie(status_counts, names='Status', values='Count', hole=0.4, 
                                   color_discrete_sequence=px.colors.qualitative.Pastel)
                fig_status.update_layout(margin=dict(t=0, b=0, l=0, r=0), paper_bgcolor='rgba(0,0,0,0)')
                st.plotly_chart(fig_status, use_container_width=True)
            else:
                st.write("No data")
                
        with c2:
            st.markdown("#### Top 10 Requested Paths")
            if 'request' in filtered_df.columns and not filtered_df.empty:
                req_counts = filtered_df['request'].value_counts().head(10).reset_index()
                req_counts.columns = ['Path', 'Hits']
                fig_req = px.bar(req_counts, y='Path', x='Hits', orientation='h',
                                color_discrete_sequence=['#E20071'])
                fig_req.update_layout(yaxis={'categoryorder':'total ascending'}, margin=dict(t=0, b=0, l=0, r=0), paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
                st.plotly_chart(fig_req, use_container_width=True)
            else:
                st.write("No data")
                
        st.markdown("#### Hits Over Time (By Source File)")
        if '_source_file' in filtered_df.columns and not filtered_df.empty:
            time_counts = filtered_df['_source_file'].value_counts().reset_index()
            time_counts.columns = ['Date File', 'Hits']
            time_counts = time_counts.sort_values('Date File')
            fig_time = px.line(time_counts, x='Date File', y='Hits', markers=True,
                              color_discrete_sequence=['#00f2fe'])
            fig_time.update_layout(margin=dict(t=0, b=0, l=0, r=0), paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)')
            st.plotly_chart(fig_time, use_container_width=True)
            
        st.markdown("---")
        st.markdown("### 📋 Log Data Table")
        
        st.dataframe(filtered_df, use_container_width=True)
        
        csv = filtered_df.to_csv(index=False).encode('utf-8')
        st.download_button(
            label="⬇️ Download Filtered Data as CSV",
            data=csv,
            file_name='filtered_logs.csv',
            mime='text/csv',
        )
