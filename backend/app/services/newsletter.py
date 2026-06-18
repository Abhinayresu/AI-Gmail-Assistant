import logging
import math
import json
from supabase import Client
from app.services.embeddings import get_embedding
from app.services.gemini import get_genai

logger = logging.getLogger(__name__)

def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot_product = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    return dot_product / (norm_a * norm_b or 1.0)

async def generate_newsletter_clusters(supabase: Client, user_uuid: str) -> list:
    logger.info(f"[Newsletter Service] Starting clustering pipeline for user: {user_uuid}")

    # 1. Fetch user newsletters
    emails_response = supabase.table("emails").select(
        "id, sender, receiver, body, created_at, threads!inner(id, subject, user_id)"
    ).eq("category", "Newsletter").eq("threads.user_id", user_uuid).execute()

    if not emails_response.data:
        logger.info("[Newsletter Service] No newsletters found in DB.")
        return []

    emails_data = emails_response.data
    email_ids = [e["id"] for e in emails_data]

    # 2. Fetch embeddings
    embeddings_response = supabase.table("email_embeddings").select(
        "email_id, embedding"
    ).in_("email_id", email_ids).execute()

    embedding_map = {}
    if embeddings_response.data:
        for row in embeddings_response.data:
            emb = row["embedding"]
            if isinstance(emb, str):
                try:
                    clean = emb.replace("[", "").replace("]", "")
                    embedding_map[row["email_id"]] = [float(x) for x in clean.split(",")]
                except Exception:
                    pass
            elif isinstance(emb, list):
                embedding_map[row["email_id"]] = emb

    newsletters = []
    for email in emails_data:
        thread = email.get("threads") or {}
        embedding = embedding_map.get(email["id"])

        if not embedding:
            try:
                logger.info(f"[Newsletter Service] Calculating missing vector for email {email['id']}")
                text_to_embed = f"Subject: {thread.get('subject', '')}\n\nBody: {email['body']}"
                embedding = await get_embedding(text_to_embed)
                
                # Store missing embedding
                supabase.table("email_embeddings").upsert({
                    "email_id": email["id"],
                    "embedding": embedding
                }).execute()
            except Exception as e:
                logger.error(f"[Newsletter Service] Embedding calculation failed: {e}")
                continue

        newsletters.append({
            "id": email["id"],
            "sender": email["sender"],
            "subject": thread.get("subject") or "(No Subject)",
            "body": email["body"],
            "created_at": email["created_at"],
            "embedding": embedding
        })

    if not newsletters:
        return []

    # 3. Pairwise Cosine Similarity Clustering
    SIM_THRESHOLD = 0.70
    clusters = []

    for item in newsletters:
        matched_idx = -1
        max_sim = -1.0

        for i, clus in enumerate(clusters):
            # Compare with the first element of the cluster
            sim = cosine_similarity(item["embedding"], clus[0]["embedding"])
            if sim > max_sim and sim >= SIM_THRESHOLD:
                max_sim = sim;
                matched_idx = i

        if matched_idx != -1:
            clusters[matched_idx].append(item)
        else:
            clusters.append([item])

    logger.info(f"[Newsletter Service] Clustered {len(newsletters)} emails into {len(clusters)} group(s)")

    results = []
    
    # 4. Generate Summaries using Gemini
    try:
        genai = get_genai()
        model = genai.GenerativeModel("gemini-2.5-flash")
    except Exception:
        genai = None

    for clus in clusters:
        source_emails = [{
            "id": e["id"],
            "sender": e["sender"],
            "subject": e["subject"],
            "created_at": e["created_at"]
        } for e in clus]

        topic = clus[0]["subject"]
        summary = ""

        if len(clus) > 1 and genai:
            try:
                transcript = ""
                for idx, e in enumerate(clus):
                    transcript += f"Newsletter #{idx + 1}\nFrom: {e['sender']}\nSubject: {e['subject']}\nContent:\n{e['body'][:1500]}\n\n---\n\n"

                prompt = f"""Analyze the following related newsletters that cover the same theme or topic.
Consolidate their content into:
1. A single consolidated "topic" (a concise, descriptive title or headline for this cluster).
2. A single unified "summary" (bullet points highlighting the core information, developments, and details across all of them).

Newsletters:
{transcript}

Return your response in exact JSON format:
{{
  "topic": "Consolidated Topic Name",
  "summary": "• Bullet point 1\\n• Bullet point 2\\n• Bullet point 3"
}}
Output ONLY the JSON block. Do not add any introductory or explanatory text."""

                response = model.generate_content(
                    prompt,
                    generation_config=genai.GenerationConfig(
                        response_mime_type="application/json",
                        temperature=0.2
                    )
                )
                data = json.loads(response.text.strip())
                topic = data.get("topic") or topic
                summary = data.get("summary") or ""
            except Exception as e:
                logger.error(f"[Newsletter Service] Gemini consolidation failed: {e}")
                summary = "\n".join(f"• [{e['sender'].split('<')[0]}] {e['subject']}" for e in clus)
        else:
            # Single email cluster
            single = clus[0]
            if genai:
                try:
                    prompt = f"""Summarize the following newsletter in 2-3 short bullet points. Start directly with the bullets (using •).
Subject: {single['subject']}
Content: {single['body'][:1500]}"""
                    response = model.generate_content(prompt)
                    summary = response.text.strip()
                except Exception:
                    summary = f"• Newsletter from {single['sender']}.\n• Subject: {single['subject']}"
            else:
                summary = f"• Newsletter from {single['sender']}.\n• Subject: {single['subject']}"

        results.append({
            "topic": topic,
            "summary": summary,
            "sourceEmails": source_emails,
            "created_at": clus[0]["created_at"]
        })

    # 5. Clear and write clusters back to database
    try:
        supabase.table("newsletter_clusters").delete().eq("user_id", user_uuid).execute()
        
        db_payloads = [{
            "user_id": user_uuid,
            "topic": res["topic"],
            "summary": res["summary"],
            "source_emails": res["sourceEmails"],
            "created_at": res["created_at"]
        } for res in results]

        if db_payloads:
            supabase.table("newsletter_clusters").insert(db_payloads).execute()
            logger.info(f"[Newsletter Service] Saved {len(db_payloads)} cluster records in Supabase")
    except Exception as e:
        logger.error(f"[Newsletter Service] Failed to save newsletter clusters in Supabase: {e}")

    return results
