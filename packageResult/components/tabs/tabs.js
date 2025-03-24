Component({
  properties: {
    active: {
      type: Number,
      value: 0
    },
    tabs: {
      type: Array,
      value: []
    },
    disabledTabs: {
      type: Object,
      value: {}
    }
  },
  data: {
    currentTab: 0
  },
  observers: {
    'active': function(active) {
      this.setData({
        currentTab: active
      });
    }
  },
  methods: {
    handleTabClick(e) {
      const index = e.currentTarget.dataset.index;
      if (this.properties.disabledTabs[index]) return;
      
      this.setData({
        currentTab: index
      });
      this.triggerEvent('change', { index });
    }
  }
}); 