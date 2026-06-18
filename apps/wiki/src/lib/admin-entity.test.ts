import { describe, it, expect } from "vitest";
import { typeForKind, buildImageChanges, buildEntityCreateData } from "./admin-entity";

describe("typeForKind", () => {
  it("maps Entity.kind to the legacy proposal type", () => {
    expect(typeForKind("item")).toBe("item");
    expect(typeForKind("environment")).toBe("envEntity");
    expect(typeForKind("trampler-part")).toBe("tramplerPart");
  });
  it("throws on a non-creatable kind", () => {
    expect(() => typeForKind("tech-node")).toThrow();
  });
});

describe("buildImageChanges", () => {
  it("returns null when nothing changed", () => {
    expect(buildImageChanges({ icon: "/a.png", imageAlt: "A" }, { icon: "/a.png", imageAlt: "A" })).toBeNull();
  });
  it("records only the changed image fields with old/new", () => {
    expect(buildImageChanges({ icon: "/a.png", imageAlt: null }, { icon: "/b.png", imageAlt: "B" })).toEqual({
      icon: { old: "/a.png", new: "/b.png" },
      imageAlt: { old: null, new: "B" },
    });
  });
  it("treats empty string as clearing to null", () => {
    expect(buildImageChanges({ icon: "/a.png", imageAlt: "A" }, { icon: "", imageAlt: "" })).toEqual({
      icon: { old: "/a.png", new: null },
      imageAlt: { old: "A", new: null },
    });
  });
});

describe("buildEntityCreateData", () => {
  it("builds an item with stat split + curated flag", () => {
    const out = buildEntityCreateData("item", {
      slug: "test-rifle", name: "Test Rifle", category: "weapons",
      icon: "/icons/x.png", imageAlt: "", description: "A gun [[ammo]]",
      rarity: "Rare", damage: "42", storageStack: "",
    });
    expect(out.statRelation).toBe("itemStats");
    expect(out.entityData).toMatchObject({
      slug: "test-rifle", kind: "item", name: "Test Rifle", category: "weapons",
      icon: "/icons/x.png", description: "A gun [[ammo]]", rarity: "Rare", curated: true,
    });
    expect(out.entityData.imageAlt ?? null).toBeNull();
    expect(out.statData).toMatchObject({ damage: 42 });
    expect("storageStack" in out.statData).toBe(false); // blank → omitted
  });

  it("builds an environment entity with no stat extension", () => {
    const out = buildEntityCreateData("environment", {
      slug: "test-crate", name: "Test Crate", category: "loot-containers",
    });
    expect(out.statRelation).toBeNull();
    expect(out.entityData).toMatchObject({ kind: "environment", curated: true });
    expect(Object.keys(out.statData)).toHaveLength(0);
  });

  it("rejects a bad slug", () => {
    expect(() => buildEntityCreateData("item", { slug: "Bad Slug!", name: "x", category: "weapons" })).toThrow(/slug/i);
  });

  it("rejects a category not valid for the kind", () => {
    expect(() => buildEntityCreateData("item", { slug: "ok", name: "x", category: "loot-containers" })).toThrow(/category/i);
  });

  it("rejects a missing name", () => {
    expect(() => buildEntityCreateData("item", { slug: "ok", name: "  ", category: "weapons" })).toThrow(/name/i);
  });
});
