"""Advanced reasoning scaffolds the agent can invoke: hypothesis testing,
Bayesian update, decision matrix, second-order consequences."""
def hypothesis_test(claim, evidence_for, evidence_against):
    ef = len(evidence_for or []); ea = len(evidence_against or [])
    total = ef + ea
    conf = round(ef / total * 100, 1) if total else 0
    verdict = "supported" if conf >= 70 else "contested" if conf >= 40 else "weak"
    return {"claim": claim, "confidence": conf, "verdict": verdict,
            "for": ef, "against": ea,
            "next": "Seek disconfirming evidence" if conf >= 70 else "Gather more evidence before concluding"}

def bayes_update(prior_pct, likelihood_ratio):
    """One Bayesian update: prior% and LR -> posterior%."""
    p = max(0.001, min(0.999, prior_pct / 100))
    odds = (p / (1 - p)) * likelihood_ratio
    post = odds / (1 + odds)
    return {"prior_pct": prior_pct, "likelihood_ratio": likelihood_ratio, "posterior_pct": round(post * 100, 1)}

def decision_matrix(options, criteria):
    """Weighted decision matrix: options=[{name, scores:{criterion:0-10}}], criteria={criterion: weight}."""
    results = []
    tw = sum(criteria.values()) or 1
    for o in options:
        score = sum((o.get("scores", {}).get(c, 0)) * w for c, w in criteria.items()) / tw
        results.append({"option": o.get("name"), "score": round(score, 2)})
    results.sort(key=lambda r: -r["score"])
    return {"ranking": results, "winner": results[0]["option"] if results else None}

def second_order(action, horizon="6 months"):
    return {"action": action, "horizon": horizon,
            "prompt": f"For '{action}': list (1) immediate effects, (2) what those effects cause next, (3) who is incentivized to respond and how, (4) the likely state at {horizon} if the response compounds."}
