import { describe, expect, it } from "vitest";
import { Simulation, estSauvegarde } from "@sdv/core";
import { compresser, compressionDisponible, decompresser } from "../src/compression.js";
import { sortDuDefilement } from "../src/gestes.js";
import { decrireSauvegarde } from "../src/sauvegarde.js";
import { TAILLE_MORCEAU, decouper, depuisBase64, idDistant, versBase64 } from "../src/distant.js";

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
  }, 30_000);

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

describe("sauvegardes distantes (base de l'artefact)", () => {
  it("nomme un document avec les seuls caractères permis", () => {
    expect(idDistant("auto")).toBe("auto");
    expect(idDistant("Partie du jour 312 (graine 42)")).toBe("Partie_du_jour_312_graine_42_");
    expect(idDistant("été à l'abri")).toBe("ete_a_l_abri");
    expect(idDistant("..")).toBe("partie");
    expect(idDistant("")).toBe("partie");
  });

  it("fait l'aller-retour base64 sur plus d'une tranche et découpe en morceaux", () => {
    const octets = new Uint8Array(100_000);
    for (let i = 0; i < octets.length; i++) octets[i] = (i * 31) & 255;
    const b64 = versBase64(octets);
    expect(depuisBase64(b64)).toEqual(octets);
    const morceaux = decouper(b64, 50_000);
    expect(morceaux.length).toBe(Math.ceil(b64.length / 50_000));
    expect(morceaux.join("")).toBe(b64);
    expect(decouper("")).toEqual([""]);
    expect(TAILLE_MORCEAU * 1).toBeLessThan(256 * 1024);
  });

  it("une vraie sauvegarde compressée passe en morceaux et revient intacte", async () => {
    const sim = Simulation.creer({ seed: 7 });
    sim.avancer(300);
    const source = sim.sauvegarder();
    const octets = new Uint8Array(await compresser(JSON.stringify(source)));
    const morceaux = decouper(versBase64(octets));
    const relu: unknown = JSON.parse(
      await decompresser(depuisBase64(morceaux.join("")).buffer as ArrayBuffer),
    );
    expect(estSauvegarde(relu)).toBe(true);
    expect(JSON.stringify(relu)).toBe(JSON.stringify(source));
  }, 30_000);
});
