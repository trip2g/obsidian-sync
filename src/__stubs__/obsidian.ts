export class TFile {}
export class TFolder {}
export class App {}
export const requestUrl = (): never => {
	throw new Error("requestUrl is not available in tests");
};
