"""Extract workbench crafting recipes -> sek-out/recipes.json.

Source: craftingrecipes_assets_all.bundle — plain typetree MonoBehaviours named
Recipes_<Workbench>_Workbench_T<n>, each with a `recipes` list of
{inputIngredients:[{itemId,amount}], outputIngredients:[{itemId,amount}], craftingTimeSeconds}.
(Not Odin-serialized.) Output rows: {workbench, tier, inputs:[{item,amount}], outputs, seconds},
matching what transform/recipes.ts expects. TestRecipesBundle is skipped.

Run from packages/datamine/:  python scripts/extract_crafting_recipes.py
"""
import json, os, re
import UnityPy

BUNDLE = "gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64/craftingrecipes_assets_all.bundle"
OUT = "sek-out/recipes.json"

env = UnityPy.load(BUNDLE)
out = []
for o in env.objects:
    if o.type.name != "MonoBehaviour":
        continue
    try:
        tt = o.read_typetree()
    except Exception:
        continue
    name = tt.get("m_Name", "") or ""
    if name == "TestRecipesBundle" or "recipes" not in tt:
        continue
    m = re.match(r"Recipes_(\w+?)_Workbench_T(\d)", name)
    workbench = m.group(1) if m else name
    tier = int(m.group(2)) if m else None
    for r in tt["recipes"]:
        out.append({
            "workbench": workbench,
            "tier": tier,
            "inputs": [{"item": i["itemId"], "amount": i["amount"]} for i in r["inputIngredients"]],
            "outputs": [{"item": i["itemId"], "amount": i["amount"]} for i in r["outputIngredients"]],
            "seconds": r["craftingTimeSeconds"],
        })

os.makedirs("sek-out", exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"wrote {OUT}: {len(out)} crafting recipes")
if not out:
    print("NO recipes found — check bundle name / MonoBehaviour layout for this build.")
