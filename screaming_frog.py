try:
    import streamlit as st
except ImportError:
    st = None
import pandas as pd
import sqlite3
import tempfile
import os
import zipfile
from analysis import generate_insights

def find_crawl_table(conn):
    """
    Aggressively scans the database for tables that likely contain crawl data.
    Returns (table_name, list_of_all_tables)
    """
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [t[0] for t in cursor.fetchall()]
    
    if not tables:
        return None, []

    # Priority 1: Exact matches for common SF table names
    priority_names = ['internal_all', 'internal_html', 'crawled_urls', 'internal_links']
    for p in priority_names:
        if p in tables:
            return p, tables
            
    # Priority 2: Tables containing common SEO columns
    seo_friendly_table = None
    max_rows = -1
    
    for t in tables:
        try:
            cursor.execute(f"PRAGMA table_info({t})")
            cols = [c[1].lower() for c in cursor.fetchall()]
            
            # If it has Address or URL, it's a strong candidate
            if any(key in cols for key in ['address', 'url', 'uri']):
                # Pick the one with the most rows if multiple matches
                cursor.execute(f"SELECT COUNT(*) FROM {t}")
                count = cursor.fetchone()[0]
                if count > max_rows:
                    max_rows = count
                    seo_friendly_table = t
        except:
            continue
            
    return seo_friendly_table, tables

def parse_sf_file(file):
    """
    Attempt to parse a .seospider or .dbseospider file with verbose feedback.
    Returns (DataFrame or None, DebugInfo dict)
    """
    debug_info = {"error": None, "tables_found": [], "file_type": "Unknown", "internal_files": []}
    tmp_path = None
    
    try:
        # Save to temp file
        ext = ".dbseospider" if file.name.endswith(".dbseospider") else ".seospider"
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(file.getvalue())
            tmp_path = tmp.name
        
        # 1. Check if it's a ZIP (Standard .seospider)
        if zipfile.is_zipfile(tmp_path):
            debug_info["file_type"] = "ZIP Archive (.seospider)"
            with zipfile.ZipFile(tmp_path, 'r') as z:
                file_list = z.namelist()
                debug_info["internal_files"] = file_list
                
                # Look for ANY .db file if crawl.db is missing
                db_files = [f for f in file_list if f.endswith('.db')]
                target_db = 'crawl.db' if 'crawl.db' in file_list else (db_files[0] if db_files else None)
                
                if target_db:
                    db_extract_path = os.path.join(tempfile.gettempdir(), os.path.basename(target_db))
                    z.extract(target_db, path=tempfile.gettempdir())
                    
                    conn = sqlite3.connect(db_extract_path)
                    table_name, all_tables = find_crawl_table(conn)
                    debug_info["tables_found"] = all_tables
                    
                    if table_name:
                        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
                        conn.close()
                        os.remove(db_extract_path)
                        os.remove(tmp_path)
                        return df, debug_info
                    
                    conn.close()
                    os.remove(db_extract_path)
                    debug_info["error"] = f"Found database '{target_db}' but no SEO data tables (Tables: {all_tables})"
                else:
                    debug_info["error"] = "ZIP archive found but no SQLite (.db) files inside."

        # 2. Check if it's a direct SQLite database (.dbseospider)
        try:
            debug_info["file_type"] = "Direct SQLite (.dbseospider)"
            conn = sqlite3.connect(tmp_path)
            table_name, all_tables = find_crawl_table(conn)
            debug_info["tables_found"] = all_tables
            
            if table_name:
                df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
                conn.close()
                os.remove(tmp_path)
                return df, debug_info
            
            conn.close()
            if not debug_info["error"]:
                debug_info["error"] = f"Connected to database but no SEO data tables found. (Tables: {all_tables})"
        except sqlite3.DatabaseError:
            debug_info["file_type"] = "Proprietary/Encrypted/Config"
            debug_info["error"] = "File is not a valid SQLite database or is encrypted/protected."
        except Exception as e:
            debug_info["error"] = f"Database connection error: {str(e)}"
        
        # Final Cleanup
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
        return None, debug_info

    except Exception as e:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
        debug_info["error"] = f"Unexpected parsing error: {str(e)}"
        return None, debug_info

def render_screaming_frog_page():
    st.title(" 🐸 Screaming Frog Analysis")
    st.write("Upload your Screaming Frog crawl data to get a comprehensive SEO overview and AI-driven insights.")

    uploaded_file = st.file_uploader(
        "Upload .seospider, .dbseospider, or 'Internal All' .csv/.xlsx", 
        type=["seospider", "dbseospider", "csv", "xlsx"]
    )

    # --- CLI Automation & Headless Guide ---
    with st.expander("🚀 CLI Automation & Headless Setup"):
        st.markdown("""
        ### Running Headless Crawls
        If you are running the agent on a remote server, use the **Screaming Frog CLI** to generate the `.dbseospider` files that this agent can analyze.
        """)
        
        c1, c2 = st.columns(2)
        with c1:
            st.info("📦 **Headless Installation**")
            st.code("""
# Dockerfile snippet for Ubuntu/Debian
RUN apt-get update && apt-get install -y wget gnupg
RUN wget -q -O - https://www.screamingfrog.co.uk/gpg-key.public | apt-key add -
RUN echo "deb https://www.screamingfrog.co.uk/repository/ubuntu stable main" >> /etc/apt/sources.list
RUN apt-get update && apt-get install -y screamingfrogseospider
            """, language="dockerfile")
            
        with c2:
            st.info("⚙️ **CLI Command Generator**")
            target_url = st.text_input("Target URL", "https://example.com", key="cli_target")
            storage_mode = st.selectbox("Storage Mode", ["Database", "Memory"], key="cli_storage")
            
            # Generate Command
            cmd = f"screamingfrogseospider --crawl {target_url} --headless --save-crawl --output-type dbseospider"
            if storage_mode == "Database":
                cmd += " --db-storage"
            
            st.code(cmd, language="bash")
            st.caption("Copy and run this on your remote agent to generate the analysis file.")
        
        st.divider()

    if uploaded_file is not None:
        df = None
        if uploaded_file.name.endswith((".seospider", ".dbseospider")):
            with st.spinner(f"Analyzing {uploaded_file.name}..."):
                df, debug = parse_sf_file(uploaded_file)
                
                if df is None:
                    # If it's a .seospider it might be a config file
                    if uploaded_file.name.endswith(".seospider"):
                        st.info("📄 This looks like a configuration file (.seospider). Inspecting settings...")
                        try:
                            uploaded_file.seek(0)
                            content = uploaded_file.read().decode("utf-8")
                            with st.expander("⚙️ View Configuration Content", expanded=True):
                                st.code(content, language="xml")
                        except Exception as e:
                            st.warning(f"Could not read as config file: {e}")
                            st.error(f"❌ Could not parse {uploaded_file.name} as crawl data.")
                    else:
                        st.error(f"❌ Could not parse {uploaded_file.name} directly.")
                    
                    with st.expander("🔍 Diagnostic Details"):
                        st.write(f"**Detected Format:** {debug['file_type']}")
                        if debug['error']: st.write(f"**Error Details:** {debug['error']}")
                        if debug['internal_files']: st.write(f"**Files inside ZIP:** {debug['internal_files']}")
                        if debug['tables_found']: st.write(f"**Database Tables found:** {debug['tables_found']}")
                        st.info("💡 **Recommendation:** If direct parsing fails, Screaming Frog may be using a protected format. Use the **'Internal All' CSV export** for 100% compatibility.")
        
        elif uploaded_file.name.endswith(".csv"):
            df = pd.read_csv(uploaded_file)
        elif uploaded_file.name.endswith(".xlsx"):
            df = pd.read_excel(uploaded_file)

        if df is not None:
            st.success("Data loaded successfully!")
            
            # Normalization Map
            rename_map = {
                'address': 'Address', 'url': 'Address', 'uri': 'Address',
                'status_code': 'Status Code', 'status': 'Status Code',
                'title_1': 'Title 1', 'title': 'Title 1', 'page_title': 'Title 1',
                'meta_description_1': 'Meta Description 1', 'meta_description': 'Meta Description 1',
                'h1_1': 'H1-1', 'h1': 'H1-1', 'content': 'Content Type', 'content_type': 'Content Type'
            }
            
            normalized_columns = {}
            for col in df.columns:
                lower_key = col.lower().replace(" ", "_").replace("-", "_")
                if lower_key in rename_map:
                    normalized_columns[col] = rename_map[lower_key]
            
            df = df.rename(columns=normalized_columns)

            # Dashboard Overview
            st.divider()
            col1, col2, col3, col4 = st.columns(4)
            total_urls = len(df)
            
            def get_col(df, options):
                for opt in options:
                    if opt in df.columns: return opt
                return None

            addr_col = get_col(df, ['Address', 'URL'])
            status_col = get_col(df, ['Status Code', 'Status'])
            title_col = get_col(df, ['Title 1', 'Title'])
            desc_col = get_col(df, ['Meta Description 1', 'Meta Description'])

            if status_col:
                df[status_col] = pd.to_numeric(df[status_col], errors='coerce')
                status_200 = len(df[df[status_col] == 200])
            else:
                status_200 = 0
                
            missing_titles = len(df[df[title_col].isna()]) if title_col else 0
            missing_desc = len(df[df[desc_col].isna()]) if desc_col else 0

            with col1: st.metric("Total URLs", total_urls)
            with col2: st.metric("200 OK", status_200)
            with col3: st.metric("Missing Titles", missing_titles, delta=missing_titles, delta_color="inverse")
            with col4: st.metric("Missing Meta Desc", missing_desc, delta=missing_desc, delta_color="inverse")

            # AI Insights
            st.divider()
            st.header("🧠 AI Crawl Insights")
            if st.button("Analyze with AI", type="primary"):
                with st.spinner("AI is analyzing crawl data..."):
                    cols_to_use = [c for c in [addr_col, status_col, title_col, desc_col] if c]
                    meta_df = df[cols_to_use].head(50)
                    sample_data = meta_df.to_dict('records')
                    summary_text = f"Crawl Summary: {total_urls} URLs, {status_200} OK, {missing_titles} missing titles."
                    insights = generate_insights([{"summary": summary_text}] + sample_data)
                    st.markdown(insights)

            with st.expander("View Data Table"):
                st.dataframe(df)
