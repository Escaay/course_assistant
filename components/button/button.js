Component({
  properties: {
    type: {
      type: String,
      value: 'default' // default, primary, danger
    },
    size: {
      type: String,
      value: 'medium' // small, medium, large
    },
    disabled: {
      type: Boolean,
      value: false
    },
    loading: {
      type: Boolean,
      value: false
    },
    block: {
      type: Boolean,
      value: false
    },
    icon: {
      type: String,
      value: ''
    }
  },
  
  methods: {
    handleTap() {
      if (this.properties.disabled || this.properties.loading) return;
      this.triggerEvent('tap');
    }
  }
}); 