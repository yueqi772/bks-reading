// components/paywall/paywall.js
Component({
  properties: {
    show: { type: Boolean, value: false },
    freeCount: { type: Number, value: 0 },
  },
  methods: {
    onClose() {
      this.triggerEvent('close');
    },
    onGoVip() {
      this.triggerEvent('goVip');
    },
  }
});
