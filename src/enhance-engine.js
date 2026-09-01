// Ameliore une photo directement sur notre propre serveur, gratuitement et sans limite,
// avec la librairie "sharp". Ce n'est pas une IA a reseau de neurones (ca, ca coute de
// l'argent chez un prestataire externe) : c'est un vrai traitement d'image classique
// (agrandissement de qualite, nettete, couleurs plus vives) applique a la vraie photo
// envoyee par la personne.

const sharp = require('sharp');

// maxWidth depend du plan de la personne :
// - Hebdomadaire : jusqu'a 2K (2048px de large)
// - A vie : jusqu'a la 4K (3840px de large)
//
// ratio : 'free' (garde les proportions d'origine), 'square' (1:1), 'portrait' (9:16) ou
// 'landscape' (16:9) - recadre la photo au centre sur ce format.
//
// quality : 'max' (traitement le plus soigne, un peu plus long) ou 'fast' (plus rapide,
// filtre plus leger).
async function enhanceImage(buffer, { maxWidth = 2048, ratio = 'free', quality = 'max' } = {}) {
  const image = sharp(buffer, { failOn: 'none' }).rotate(); // .rotate() sans argument = respecte l'orientation EXIF
  const metadata = await image.metadata();

  const originalWidth = metadata.width || 1024;
  const originalHeight = metadata.height || 1024;
  // On agrandit (x1.6) avec un filtre de qualite, plafonne a la resolution max du plan.
  const targetWidth = Math.min(Math.round(originalWidth * 1.6), maxWidth);

  let targetHeight;
  let fit = 'fill';
  if (ratio === 'square') {
    targetHeight = targetWidth;
    fit = 'cover';
  } else if (ratio === 'portrait') {
    targetHeight = Math.round((targetWidth * 16) / 9);
    fit = 'cover';
  } else if (ratio === 'landscape') {
    targetHeight = Math.round((targetWidth * 9) / 16);
    fit = 'cover';
  } else {
    // 'free' : on garde exactement les proportions d'origine, donc pas de recadrage.
    targetHeight = Math.round(targetWidth * (originalHeight / originalWidth));
  }

  const isFast = quality === 'fast';

  let pipeline = image.resize({
    width: targetWidth,
    height: targetHeight,
    fit,
    position: 'centre',
    // On avait soupconne "lanczos3" de creer un liseret blanc sur les bords tres
    // contrastes, mais en comparant avec l'apercu AVANT tout traitement, ce liseret etait
    // deja present sur la photo d'origine (ex: un bandeau lumineux au plafond) - ce n'est
    // pas notre traitement qui le cree. On peut donc reprendre "lanczos3", le plus net.
    kernel: isFast ? 'nearest' : 'lanczos3',
    withoutEnlargement: false,
  });

  if (!isFast) {
    // Rendu beaucoup plus marque : contraste local ("clahe", façon HDR/pro) + nettete +
    // couleurs et contraste global plus vifs, pour un resultat qui tranche vraiment avec
    // l'original (effet "comme pris avec un vrai bon appareil photo").
    pipeline = pipeline
      .clahe({ width: 8, height: 8, maxSlope: 3 })
      .sharpen({ sigma: 1.0, m1: 1, m2: 0.6 })
      .modulate({ saturation: 1.28, brightness: 1.05 })
      .linear(1.08, -9);
  } else {
    pipeline = pipeline.sharpen({ sigma: 0.6 });
  }

  const outputBuffer = await pipeline.jpeg({ quality: isFast ? 80 : 92 }).toBuffer();

  const base64 = outputBuffer.toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

module.exports = { enhanceImage };
