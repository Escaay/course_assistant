Component({
  properties: {
    index: {
      type: Number,
      value: 0
    },
    active: {
      type: Number,
      value: 0
    }
  },
  data: {
    isActive: false
  },
  observers: {
    'active, index': function(active, index) {
      this.setData({
        isActive: active === index
      });
    }
  }
}); 