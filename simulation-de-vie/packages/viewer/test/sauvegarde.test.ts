import { describe, expect, it } from "vitest";
import { Simulation, estSauvegarde } from "@sdv/core";
import {
  compresser,
  compresserParMorceaux,
  compressionDisponible,
  decompresser,
  jsonParMorceaux,
  stringifyParMorceaux,
} from "../src/compression.js";
import { sortDuDefilement } from "../src/gestes.js";
import {
  decrireSauvegarde,
  fichierDeSauvegarde,
  lireFichierSauvegarde,
} from "../src/sauvegarde.js";
import { TAILLE_MORCEAU, decouper, depuisBase64, idDistant, versBase64 } from "../src/distant.js";

describe("compression des sauvegardes", () => {
  it("compresse et relit un texte à l'identique, en bien moins d'octets", async () => {
    expect(compressionDisponible()).toBe(true);
    const texte = JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ id: i, nom: "Ambre" })));
    const octets = await compresser(texte);
    expect(octets.byteLength).toBeLessThan(texte.length / 5);
    expect(await decompresser(octets)).toBe(texte);
  });

  it("le JSON par morceaux est exactement celui de JSON.stringify, et le flux gzip se relit", async () => {
    const sim = Simulation.creer({ seed: 42 });
    sim.avancer(150);
    const source = sim.sauvegarder();
    const attendu = JSON.stringify(source);
    const morceaux = [...jsonParMorceaux(source)];
    expect(morceaux.length).toBeGreaterThan(sim.personnages.length + 10);
    expect(morceaux.join("")).toBe(attendu);
    expect(await stringifyParMorceaux(source)).toBe(attendu);
    expect(
      [...jsonParMorceaux({ a: [1, { b: undefined, c: null }], d: "x", e: undefined })].join(""),
    ).toBe(JSON.stringify({ a: [1, { b: undefined, c: null }], d: "x", e: undefined }));
    const octets = await compresserParMorceaux(source);
    if (octets === null) throw new Error("abandonné");
    expect(await decompresser(octets)).toBe(attendu);
    expect(octets.byteLength).toBeLessThan(attendu.length / 4);
    // Abandonné entre deux tranches : null, sans rien laisser pendre.
    expect(await compresserParMorceaux(source, () => true)).toBeNull();
  }, 30_000);

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

describe("M45 : une sauvegarde qui passe par un fichier", () => {
  it("relit l'instantané comprimé que sème `sim traverser`, et le reconnaît à ses octets", async () => {
    const sim = Simulation.creer({ seed: 7 });
    sim.avancer(300);
    const source = sim.sauvegarder();
    const octets = await compresser(JSON.stringify(source));
    // Nom trompeur exprès : c'est l'en-tête gzip qui doit décider, pas l'extension.
    const fichier = new File([octets], "renomme-par-la-messagerie.json", {
      type: "application/octet-stream",
    });
    const relu = await lireFichierSauvegarde(fichier);
    expect(estSauvegarde(relu)).toBe(true);
    expect(relu.tick).toBe(source.tick);
    expect(relu.vivants).toBe(source.vivants);
    // Et le monde repart vraiment de là.
    const reprise = Simulation.restaurer(relu);
    expect(reprise.tick).toBe(sim.tick);
    expect(reprise.vivants().length).toBe(sim.vivants().length);
  });

  it("relit aussi un instantané en clair (option --json de la traversée)", async () => {
    const sim = Simulation.creer({ seed: 8 });
    sim.avancer(144);
    const source = sim.sauvegarder();
    const fichier = new File([JSON.stringify(source)], "jour-000001.json", {
      type: "application/json",
    });
    expect((await lireFichierSauvegarde(fichier)).tick).toBe(source.tick);
  });

  it("refuse ce qui n'est pas une sauvegarde, en le disant", async () => {
    const pasDuJson = new File(["ceci n'est pas du JSON"], "notes.json");
    await expect(lireFichierSauvegarde(pasDuJson)).rejects.toThrow(/JSON illisible/);
    const jsonQuiNEstPasUneSauvegarde = new File(['{"bonjour":1}'], "autre.json");
    await expect(lireFichierSauvegarde(jsonQuiNEstPasUneSauvegarde)).rejects.toThrow(
      /pas une sauvegarde/,
    );
  });

  it("exporte un fichier comprimé que l'on sait relire, nommé par le jour", async () => {
    const sim = Simulation.creer({ seed: 9 });
    sim.avancer(288);
    const source = sim.sauvegarder();
    const { nom, blob } = await fichierDeSauvegarde(source);
    expect(nom).toContain(String(source.jour).padStart(6, "0"));
    expect(nom.endsWith(".json.gz")).toBe(compressionDisponible());
    expect(blob.size).toBeLessThan(JSON.stringify(source).length / 3);
    const relu = await lireFichierSauvegarde(new File([blob], nom));
    expect(relu.tick).toBe(source.tick);
  });
});
