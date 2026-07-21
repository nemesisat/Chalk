import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "../lib/diagnose-server";

async function syntheticJpegWithExif(): Promise<string> {
  const buffer = await sharp({
    create: { width: 24, height: 24, channels: 3, background: { r: 200, g: 180, b: 40 } },
  })
    .jpeg()
    .withExif({
      IFD0: {
        Copyright: "synthetic-test-data",
        Artist: "synthetic-student-name",
        Software: "chalk-test-suite",
      },
    })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

describe("stripImageMetadata", () => {
  it("removes EXIF metadata from the re-encoded image", async () => {
    const input = await syntheticJpegWithExif();

    const inputBuffer = Buffer.from(input.split(",")[1], "base64");
    const inputMeta = await sharp(inputBuffer).metadata();
    expect(inputMeta.exif).toBeDefined();

    const output = await stripImageMetadata(input);
    const outputBuffer = Buffer.from(output.split(",")[1], "base64");
    const outputMeta = await sharp(outputBuffer).metadata();

    expect(outputMeta.exif).toBeUndefined();
    expect(outputMeta.format).toBe("jpeg");
  });

  it("re-encodes PNG input to JPEG (dropping any ancillary chunks)", async () => {
    const pngBuffer = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    const output = await stripImageMetadata(
      `data:image/png;base64,${pngBuffer.toString("base64")}`,
    );
    expect(output).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("rejects non-image and unsupported data URLs", async () => {
    await expect(stripImageMetadata("data:image/gif;base64,R0lGOD")).rejects.toThrow(
      "JPEG, PNG, or WEBP",
    );
    await expect(stripImageMetadata("plain text")).rejects.toThrow("JPEG, PNG, or WEBP");
  });

  it("rejects images larger than 10 MB", async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 1).toString("base64");
    await expect(stripImageMetadata(`data:image/jpeg;base64,${oversized}`)).rejects.toThrow(
      "between 1 byte and 10 MB",
    );
  });

  it("rejects a data URL whose payload is not a decodable image", async () => {
    const garbage = Buffer.from("not really a jpeg").toString("base64");
    await expect(stripImageMetadata(`data:image/jpeg;base64,${garbage}`)).rejects.toThrow();
  });
});
