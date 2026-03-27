type MessageHandler = (ev: MessageEvent) => void;

interface Subscription {
  type: string;
  handler: MessageHandler;
}

class MessageDispatcher {
  private subscriptions: Subscription[] = [];
  private isInitialized = false;

  public initialize() {
    if (this.isInitialized) {
      return;
    }
    window.addEventListener('message', this.handleGlobalMessage.bind(this));
    this.isInitialized = true;
    console.log('MessageDispatcher initialized');
  }

  public destroy() {
    window.removeEventListener('message', this.handleGlobalMessage.bind(this));
    this.subscriptions = [];
    this.isInitialized = false;
    console.log('MessageDispatcher destroyed');
  }

  public subscribe(type: string, handler: MessageHandler): () => void {
    if (!type || typeof handler !== 'function') {
      console.error('Invalid subscription parameters:', type, handler);
      return () => {};
    }
    const subscription = { type, handler };
    this.subscriptions.push(subscription);

    return () => {
      this.unsubscribe(type, handler);
    };
  }

  public unsubscribe(type: string, handler: MessageHandler) {
    this.subscriptions = this.subscriptions.filter(
      (sub) => !(sub.type === type && sub.handler === handler),
    );
  }

  private handleGlobalMessage(ev: MessageEvent) {
    const messageType = ev.data?.type;
    if (!messageType) {
      return;
    }

    const subscriptions = this.subscriptions.filter((sub) => sub.type === messageType);
    subscriptions.forEach((sub) => {
      try {
        sub.handler(ev);
      } catch (error) {
        console.error(`Error in handler for message type ${messageType}:`, error);
      }
    });
  }
}

export const messageDispatcher = new MessageDispatcher();
