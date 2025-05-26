export class JustDeleteMeInfo {
  constructor({ difficulty = null, url = null, notes = null } = {}) {
    this.difficulty = difficulty;
    this.url = url;
    this.notes = notes;
  }
}

export class SubscriptionInfo {
  constructor({ confidence, amount = null, frequency = null, status = null }) {
    this.confidence = confidence;
    this.amount = amount;
    this.frequency = frequency;
    this.status = status;
  }
}

export default class Account {
  constructor({ name = '', subject = '', from = '', domain = '', canonicalKey = null, justDeleteMeData = null, lastEmailDate = null, confidence = null, subscription = null } = {}) {
    this.name = name;
    this.subject = subject;
    this.from = from;
    this.domain = domain;
    this.canonicalKey = canonicalKey;
    this.justDeleteMeData = justDeleteMeData;
    this.lastEmailDate = lastEmailDate;
    this.confidence = confidence;
    this.subscription = subscription;
  }
}
