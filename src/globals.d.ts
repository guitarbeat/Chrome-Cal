/**
 * @file Global Type Declarations
 * @description Global type definitions and ambient declarations
 * @author Your Name
 * @version 1.0.0
 */

/**
 * Google API client interface
 * @interface Gapi
 */
declare interface Gapi {
  load: (module: string, callback: () => void) => void;
  client: {
    init: (config: {
      apiKey: string;
      clientId: string;
      discoveryDocs: string[];
      scope: string;
    }) => Promise<void>;
    // Add other client methods as needed
  };
}

declare global {
  interface Window {
    gapi: Gapi;
  }
}

export {};
