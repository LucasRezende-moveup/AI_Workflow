
import unittest
import pandas as pd
from analysis import analyze_rank_1_opportunities, analyze_ctr_gaps

class TestAnalysis(unittest.TestCase):
    def test_rank_1_opportunities(self):
        """Test detection of Rank 1 opportunities (Position 1.1-3.0)."""
        data = [
            {'query': 'opportunity', 'position': 2.5, 'impressions': 2000, 'clicks': 50, 'ctr': 0.05, 'page': '/'},
            {'query': 'already #1', 'position': 1.0, 'impressions': 1000, 'clicks': 100, 'ctr': 0.1, 'page': '/'},
            {'query': 'too low', 'position': 15.0, 'impressions': 500, 'clicks': 10, 'ctr': 0.01, 'page': '/'}
        ]
        df = pd.DataFrame(data)
        insights = analyze_rank_1_opportunities(df)
        
        # Should find 'opportunity' but not others
        self.assertTrue(any('opportunity' in i for i in insights))
        self.assertFalse(any('already #1' in i for i in insights))
        self.assertFalse(any('too low' in i for i in insights))

    def test_ctr_gaps(self):
        """Test detection of CTR gaps."""
        # Create a dataset where expected CTR for pos 3 is ~5%
        data = [
            # Benchmark setter:
            {'query': 'benchmark1', 'position': 3.0, 'impressions': 1000, 'clicks': 50, 'ctr': 0.05, 'page': '/'},
            {'query': 'benchmark2', 'position': 3.0, 'impressions': 1000, 'clicks': 50, 'ctr': 0.05, 'page': '/'},
            
            # Underperformer:
            {'query': 'gap', 'position': 3.0, 'impressions': 1000, 'clicks': 10, 'ctr': 0.01, 'page': '/'},
            
            # Good performer:
            {'query': 'good', 'position': 3.0, 'impressions': 1000, 'clicks': 60, 'ctr': 0.06, 'page': '/'}
        ]
        df = pd.DataFrame(data)
        
        # The average CTR for pos 3 will be (0.05 + 0.05 + 0.01 + 0.06) / 4 = 0.0425
        # The 'gap' query has 0.01 which is < 0.6 * 0.0425 (0.0255) -> Should be flagged
        
        insights = analyze_ctr_gaps(df)
        
        self.assertTrue(any('gap' in i for i in insights), f"Insights found: {insights}")
        self.assertFalse(any('good' in i for i in insights))

if __name__ == '__main__':
    unittest.main()
