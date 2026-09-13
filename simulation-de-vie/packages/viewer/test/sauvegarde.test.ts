import { describe, expect, it } from "vitest";
import { Simulation, estSauvegarde } from "@sdv/core";
import { compresser, compressionDisponible, decompresser } from "../src/compression.js";
import { sortDuDefilement } from "../src/gestes.js";
import { decrireSauvegarde } from "../src/sauvegarde.js";

describe("compression des sauvegardes", () => {
  it("compresse et relit un texte à l'identique, en bien moins d'octets", async () => {
    expect(compressionDisponible()).toBe(true);
    const texte = JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ id: i, nom: "Ambre" })));
    const octets = await compresser(texte);
    expect(octets.byteLength).toBeLessThan(texte.length / 5);
    expect(await decompresser(octets)).toBe(texte);
  });

  it("fait passer une vraie sauvegarde par le JSON compressé sans rien perdre", async () => {
    const sim = Simulation.creer({ seed: 42 });
    sim.avancer(300);
    const source = sim.sauvegarder();
    const relu: unknown = JSON.parse(await decompresser(await compresser(JSON.stringify(source))));
    expect(estSauvegarde(relu)).toBe(true);
    const copie = Simulation.restaurer(relu);
    expect(copie.tick).toBe(sim.tick);
    sim.avancer(200);
    copie.avancer(200);
    expect(copie.vivants().map((p) => p.id)).toEqual(sim.vivants().map((p) => p.id));
    expect(JSON.stringify(copie.sauvegarder().etat)).toBe(JSON.stringify(sim.sauvegarder().etat));
  });

  it("décrit la taille sur le disque quand elle est connue", () => {
    const base = { nom: "auto", date: 0, seed: "42", jour: 3, vivants: 12 };
    expect(decrireSauvegarde(base)).not.toContain("Mo");
    expect(decrireSauvegarde({ ...base, taille: 1_572_864 })).toContain("1,5 Mo");
  });
});

describe("garde contre le tirer-pour-rafraîchir", () => {
  const liste = { scrollTop: 40, clientHeight: 100, scrollHeight: 300 };
  it("laisse défiler à l'intérieur d'une liste", () => {
    expect(sortDuDefilement(liste, 10)).toBe(false);
    expect(sortDuDefilement(liste, -10)).toBe(false);
  });
  it("retient le doigt qui tire vers le bas en haut de la liste, et vers le haut en bas", () => {
    expect(sortDuDefilement({ ...liste, scrollTop: 0 }, 10)).toBe(true);
    expect(sortDuDefilement({ ...liste, scrollTop: 0 }, -10)).toBe(false);
    expect(sortDuDefilement({ ...liste, scrollTop: 200 }, -10)).toBe(true);
    expect(sortDuDefilement({ ...liste, scrollTop: 200 }, 10)).toBe(false);
  });
  it("retient tout geste vertical là où rien ne défile", () => {
    expect(sortDuDefilement(null, 10)).toBe(true);
    expect(sortDuDefilement(null, -10)).toBe(true);
  });
});
