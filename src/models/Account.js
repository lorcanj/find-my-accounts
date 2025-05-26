export class JustDeleteMeInfo {
  constructor({ difficulty = null, url = null, notes = null } = {}) {
    this.difficulty = difficulty;
    this.url = url;
    this.notes = notes;
  }
}

export default class Account {
  constructor({ name = '', subject = '', from = '', domain = '', canonicalKey = null, justDeleteMeData = null, lastEmailDate = null, confidence = null } = {}) {
    this.name = name;
    this.subject = subject;
    this.from = from;
    this.domain = domain;
    this.canonicalKey = canonicalKey;
    this.justDeleteMeData = justDeleteMeData;
    this.lastEmailDate = lastEmailDate;
    this.confidence = confidence;
  }
}
