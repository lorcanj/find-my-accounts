export class JustDeleteMeInfo {
  constructor({ difficulty = null, url = null, notes = null } = {}) {
    this.difficulty = difficulty;
    this.url = url;
    this.notes = notes;
  }
}

export default class Account {
  constructor({ name = '', subject = '', from = '', domain = '', canonicalKey = null, justDeleteMeData = null, lastEmailDate = null, confidence = null, isSubscription = false, subscriptionConfidence = null, amount = null, frequency = null, subscriptionStatus = null } = {}) {
    this.name = name;
    this.subject = subject;
    this.from = from;
    this.domain = domain;
    this.canonicalKey = canonicalKey;
    this.justDeleteMeData = justDeleteMeData;
    this.lastEmailDate = lastEmailDate;
    this.confidence = confidence;
    this.isSubscription = isSubscription;
    this.subscriptionConfidence = subscriptionConfidence;
    this.amount = amount;
    this.frequency = frequency;
    this.subscriptionStatus = subscriptionStatus;
  }
}
