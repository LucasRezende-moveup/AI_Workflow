import pandas as pd



def analyze_rank_1_opportunities(df):
    """
    Identifies queries ranking between 1.1 and 3.0 (Striking Distance).
    These are prime candidates for optimization to reach #1.
    """
    if 'position' not in df.columns or 'impressions' not in df.columns or 'query' not in df.columns:
        return []

    # Filter for positions 1.1 to 3.0
    opportunities = df[
        (df['position'] > 1.0) & 
        (df['position'] <= 3.0) & 
        (df['impressions'] > df['impressions'].median())
    ].sort_values('impressions', ascending=False)
    
    insights = []
    if not opportunities.empty:
        insights.append(f"🚀 **Rank 1 Opportunities**: Found {len(opportunities)} queries ranking #2-3 with high impressions.")
        for _, row in opportunities.head(3).iterrows():
            insights.append(f"   - '{row['query']}' (Pos: {row['position']:.1f}, Imp: {row['impressions']})")
    
    return insights

def analyze_ctr_gaps(df):
    """
    Identifies queries with CTR significantly below the average for their position content.
    """
    if 'ctr' not in df.columns or 'position' not in df.columns:
        return []

    # Round position to integer to compare against average of that position
    df['pos_int'] = df['position'].round().astype(int)
    
    # Calculate average CTR per position (simple benchmark)
    adhoc_benchmark = df.groupby('pos_int')['ctr'].mean()
    
    # Find rows where CTR is < 60% of the benchmark for that position
    underperforming = []
    for index, row in df.iterrows():
        pos = int(round(row['position']))
        if pos in adhoc_benchmark:
            expected_ctr = adhoc_benchmark[pos]
            if row['ctr'] < (expected_ctr * 0.6) and row['clicks'] > 5: # Only consider if sufficient data
                 underperforming.append((row['query'], row['page'], row['ctr'], expected_ctr, row['position']))
    
    insights = []
    if underperforming:
        insights.append(f"📉 **CTR Gaps**: Found {len(underperforming)} queries performing significantly below average for their position.")
        # Sort by gap magnitude (difference between expected and actual)
        underperforming.sort(key=lambda x: x[3] - x[2], reverse=True)
        for q, p, ctr, exp, pos in underperforming[:3]:
            insights.append(f"   - '{q}' (Pos: {pos:.1f}) has CTR {ctr*100:.1f}%, expected ~{exp*100:.1f}%.")

    return insights

def ask_agent(query, rows):
    """
    Uses Gemini to answer a natural language query based on the provided GSC data.
    """
    import os
    if not os.getenv("GOOGLE_API_KEY"):
        return "Gemini API key not found. Please provide it in the sidebar."

    # Prepare data context (limit rows to avoid token limits if necessary)
    context_rows = rows[:100]  # Send first 100 rows as context

    prompt = f"""
    You are an SEO expert AI agent. Use the following Google Search Console data (aggregated by Keyword and URL) to answer the user's request.

    Data (JSON):
    {context_rows}

    User Request: {query}

    Provide a concise, professional, and actionable response. If the data doesn't contain the answer, say so.
    """

    try:
        from gemini_utils import gemini_generate
        return gemini_generate(prompt)
    except Exception as e:
        return f"Error communicating with Gemini: {e}\n\nTroubleshooting: Ensure your API key is active and has access to Gemini Flash/Pro in Google AI Studio."

def generate_insights(rows):
    """
    Analyzes GSC data rows and returns insights.
    Expects rows to be a list of dicts from the API.
    """
    if not rows:
        return "No data available for analysis."

    # Convert to DataFrame
    df = pd.DataFrame(rows)
    
    # Ensure numeric columns are correct
    numeric_cols = ['clicks', 'impressions', 'ctr', 'position']
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col])

    insights = []
    
    # 0. Rank 1 Opportunities (New)
    insights.extend(analyze_rank_1_opportunities(df))

    # 1. Quick Wins (High outcome, low CTR - Existing)
    # Filter: Position < 20, Impressions > median, CTR < average
    if 'impressions' in df.columns and 'position' in df.columns:
        median_impressions = df['impressions'].median()
        avg_ctr = df['ctr'].mean()
        
        quick_wins = df[
            (df['position'] > 3.0) & # Adjusted to not overlap with Rank 1 opps
            (df['position'] < 20) & 
            (df['impressions'] > median_impressions) & 
            (df['ctr'] < avg_ctr)
        ]
        
        if not quick_wins.empty:
            insights.append(f"💡 **Quick Wins**: Found {len(quick_wins)} opportunities (Pos 4-20) with potential.")

    # 2. CTR Gaps (New)
    insights.extend(analyze_ctr_gaps(df))

    # 3. Keyword Cannibalization (Existing)
    # Group by query, count unique pages
    if 'query' in df.columns and 'page' in df.columns:
        cannibalization = df.groupby('query')['page'].nunique()
        potential_issues = cannibalization[cannibalization > 1]
        
        if not potential_issues.empty:
            insights.append(f"⚠️ **Cannibalization**: {len(potential_issues)} queries ranking with multiple pages.")
            for query, count in potential_issues.head(3).items():
                insights.append(f"   - '{query}' appears on {count} pages.")

    return "\n\n".join(insights) if insights else "No specific insights found yet."
