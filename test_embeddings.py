import os
from dotenv import load_dotenv
from hreflang_checker import embedding_engine, cosine_similarity
import numpy as np

load_dotenv()

def test_cloud_embeddings():
    print("Testing Cloud EmbeddingEngine (Google Text-004)...")
    
    texts = [
        "About Us",
        "Sobre Nós",
        "Contact",
        "Contato",
        "Privacy Policy",
        "Política de Privacidade"
    ]
    
    embeddings = embedding_engine.encode(texts)
    print(f"Embeddings generated: {len(embeddings)} vectors")
    print(f"Vector dimension: {len(embeddings[0])}")
    
    # Check similarity between "About Us" and "Sobre Nós"
    sim_about = cosine_similarity(embeddings[0], embeddings[1])
    print(f"Similarity 'About Us' vs 'Sobre Nós': {sim_about:.4f}")
    
    # Check similarity between "About Us" and "Contact"
    sim_diff = cosine_similarity(embeddings[0], embeddings[2])
    print(f"Similarity 'About Us' vs 'Contact': {sim_diff:.4f}")
    
    # Check similarity between "Privacy Policy" and "Política de Privacidade"
    sim_privacy = cosine_similarity(embeddings[4], embeddings[5])
    print(f"Similarity 'Privacy Policy' vs 'Política de Privacidade': {sim_privacy:.4f}")
    
    assert sim_about > 0.65, "Similarity for translations should be high"
    assert sim_privacy > 0.65, "Similarity for translations should be high"
    assert sim_about > sim_diff, "Similarity for translations should be higher than different topics"
    
    print("Cloud Embedding Test passed!")

if __name__ == "__main__":
    if not os.getenv("GOOGLE_API_KEY"):
        print("ERROR: GOOGLE_API_KEY not set in .env")
    else:
        try:
            test_cloud_embeddings()
        except Exception as e:
            print(f"Test failed with error: {e}")
