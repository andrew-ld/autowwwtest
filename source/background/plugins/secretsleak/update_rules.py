import requests
import tomllib
import json

raw_rules = requests.get("https://raw.githubusercontent.com/gitleaks/gitleaks/refs/heads/master/config/gitleaks.toml").text
rules = tomllib.loads(raw_rules)

result = []

for rule in rules["rules"]:
    if "regex" not in rule:
        continue

    if "keywords" not in rule:
        continue

    regex = rule["regex"]
    rid = rule["id"]
    keywords = rule["keywords"]
    description = rule["description"]
    
    if "entropy" in rule:
        entropy = rule["entropy"]
    else:
        entropy = None

    if rid == "generic-api-key":
        continue
    
    result.append({"regex": regex, "description": description, "id": rid, "keywords": keywords, "entropy": entropy})

json.dump(result, open("rules.json", "w"), indent=4)
