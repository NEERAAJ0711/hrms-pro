import * as faceapi from "@vladmandic/face-api";
import { createCanvas, loadImage } from "canvas";
import path from "path";
import fs from "fs";

let modelsLoaded = false;
const MODEL_PATH = path.join(process.cwd(), "node_modules/@vladmandic/face-api/model");

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  // Patch faceapi to use node-canvas
  const { Canvas, Image, ImageData } = await import("canvas");
  faceapi.env.monkeyPatch({ Canvas: Canvas as any, Image: Image as any, ImageData: ImageData as any });
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH);
  modelsLoaded = true;
  console.log("[face-match] Models loaded successfully");
}

export async function extractDescriptor(imagePath: string): Promise<Float32Array | null> {
  await loadFaceModels();
  const fullPath = imagePath.startsWith("/") && !imagePath.startsWith(process.cwd())
    ? path.join(process.cwd(), "server", imagePath)
    : imagePath;

  if (!fs.existsSync(fullPath)) {
    console.warn("[face-match] Image not found:", fullPath);
    return null;
  }

  const img = await loadImage(fullPath);
  const canvas = createCanvas(img.width as number, img.height as number);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img as any, 0, 0);

  const detection = await faceapi
    .detectSingleFace(canvas as any, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return null;
  return detection.descriptor;
}

export function euclideanDistance(d1: Float32Array, d2: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < d1.length; i++) sum += (d1[i] - d2[i]) ** 2;
  return Math.sqrt(sum);
}

export interface FaceMatchResult {
  match: boolean;
  distance: number;
  reason: string;
}

export async function matchFaces(
  registeredImagePath: string,
  capturedImagePath: string,
  threshold = 0.55
): Promise<FaceMatchResult> {
  try {
    const [regDesc, capDesc] = await Promise.all([
      extractDescriptor(registeredImagePath),
      extractDescriptor(capturedImagePath),
    ]);

    if (!regDesc) {
      return { match: false, distance: 1, reason: "No face found in the registered photo. Please re-register your face." };
    }
    if (!capDesc) {
      return { match: false, distance: 1, reason: "No face detected in the captured photo. Ensure good lighting and face the camera directly." };
    }

    const distance = euclideanDistance(regDesc, capDesc);
    const match = distance <= threshold;
    return {
      match,
      distance: Math.round(distance * 1000) / 1000,
      reason: match
        ? `Face matched (similarity: ${Math.round((1 - distance) * 100)}%)`
        : `Face does not match registered face (distance: ${distance.toFixed(3)}, threshold: ${threshold})`,
    };
  } catch (err) {
    console.error("[face-match] Error comparing faces:", err);
    return { match: false, distance: 1, reason: "Face comparison error. Please try again." };
  }
}
