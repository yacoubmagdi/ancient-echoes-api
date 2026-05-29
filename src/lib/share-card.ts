type ShareCardInput = {
  userImage: string;
  matchImage: string;
  name: string;
  category: string;
  similarity: number;
  description: string;
  title: string;
  youLabel: string;
  matchLabel: string;
  resemblanceLabel: string;
  footerLabel: string;
};

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const ir = img.width / img.height;
  const tr = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;

  if (ir > tr) {
    sw = img.height * tr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / tr;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }

  if (line) lines.push(line);
  return lines;
}

export async function buildShareCardDataUrl(input: ShareCardInput) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Canvas unavailable");

  const [uImg, mImg] = await Promise.all([
    loadImg(input.userImage),
    loadImg(input.matchImage),
  ]);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b0a1f");
  bg.addColorStop(1, "#1a1430");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#c9a84c";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  ctx.fillStyle = "#e8d27a";
  ctx.textAlign = "center";
  ctx.font = "bold 56px serif";
  ctx.fillText(input.title, W / 2, 100);

  const portraitSize = 320;
  const portraitY = 540;
  const leftX = 60;
  const rightX = W - 60 - portraitSize;

  const drawCircle = (img: HTMLImageElement, x: number, y: number, label: string) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + portraitSize / 2, y + portraitSize / 2, portraitSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    drawCover(ctx, img, x, y, portraitSize, portraitSize);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x + portraitSize / 2, y + portraitSize / 2, portraitSize / 2, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#c9a84c";
    ctx.stroke();

    ctx.fillStyle = "#cfcfe0";
    ctx.font = "26px sans-serif";
    ctx.fillText(label, x + portraitSize / 2, y + portraitSize + 42);
  };

  drawCircle(uImg, leftX, portraitY, input.youLabel);
  drawCircle(mImg, rightX, portraitY, input.matchLabel);

  ctx.fillStyle = "#f5e9b8";
  ctx.font = "bold 38px serif";
  ctx.fillText(input.name, W / 2, 220);

  ctx.fillStyle = "#a89cc6";
  ctx.font = "italic 26px serif";
  ctx.fillText(input.category, W / 2, 262);

  const barX = 60 + portraitSize + 20;
  const barY = portraitY + portraitSize / 2 - 9;
  const barW = W - 2 * (60 + portraitSize + 20);
  const barH = 18;
  ctx.fillStyle = "#2a2440";
  ctx.fillRect(barX, barY, barW, barH);
  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  grad.addColorStop(0, "#c9a84c");
  grad.addColorStop(1, "#f5e9b8");
  ctx.fillStyle = grad;
  ctx.fillRect(barX, barY, (barW * input.similarity) / 100, barH);

  ctx.fillStyle = "#e8d27a";
  ctx.font = "bold 32px sans-serif";
  ctx.fillText(`${input.similarity}% ${input.resemblanceLabel}`, W / 2, barY + 56);

  ctx.fillStyle = "#d8d4e8";
  ctx.font = "26px sans-serif";
  const lines = wrapText(ctx, input.description, W - 200).slice(0, 8);
  lines.forEach((line, index) => {
    ctx.fillText(line, W / 2, 960 + index * 36);
  });

  ctx.fillStyle = "#8a82a8";
  ctx.font = "24px sans-serif";
  ctx.fillText(input.footerLabel, W / 2, H - 60);

  return canvas.toDataURL("image/png");
}