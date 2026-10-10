import { PDFDocument } from 'pdf-lib'

const MAX_WIDTH_PT = 842 // keep big photos at a readable page size

/** Wrap one or more image files (jpg/png/others via canvas) into a PDF, one image per page. */
export async function imagesToPdf(files) {
  const doc = await PDFDocument.create()
  for (const file of files) {
    let bytes = new Uint8Array(await file.arrayBuffer())
    let img
    if (file.type === 'image/jpeg') img = await doc.embedJpg(bytes)
    else if (file.type === 'image/png') img = await doc.embedPng(bytes)
    else {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d').drawImage(bitmap, 0, 0)
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92))
      bytes = new Uint8Array(await blob.arrayBuffer())
      img = await doc.embedJpg(bytes)
    }
    const k = Math.min(1, MAX_WIDTH_PT / (img.width * 0.75))
    const width = img.width * 0.75 * k
    const height = img.height * 0.75 * k
    doc.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height })
  }
  return doc.save()
}
