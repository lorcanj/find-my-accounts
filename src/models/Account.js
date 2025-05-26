export class JustDeleteMeInfo {
  constructor({ difficulty, url, notes } = {}) {
    this.difficulty = difficulty;
    this.url = url;
    this.notes = notes;
  }
}

export default class Account {
  constructor({ name = '', subject = '', from = '', snippet = '', domain = '', canonicalKey = null, justDeleteMeData = null } = {}) {
    this.name = name;
    this.subject = subject;
    this.from = from;
    this.snippet = snippet;
    this.domain = domain;
    this.canonicalKey = canonicalKey;
    this.justDeleteMeData = justDeleteMeData;
  }
}
