export interface QuestionBase {
  text: string;
  context?: string | null;
  choices?: string[];
  multiSelect?: boolean;
  chosenIndices: number[];
  textAnswer: string;
}
