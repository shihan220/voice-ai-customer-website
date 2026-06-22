declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.css';

type DetectedBarcode = {
  rawValue?: string;
};

type BarcodeDetectorOptions = {
  formats?: string[];
};

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
  static getSupportedFormats?: () => Promise<string[]>;
}
