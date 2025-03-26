Component({
	options: {
		styleIsolation: 'shared'
	},
	properties: {
		data: {
			type: Object,
			value: {}
		}
	},
	data: {
		attr:{
			src:'',
			class:''
		},
		size:{
			w:0,
			h:0
		}
	},
	lifetimes:{
		attached:function(){
			const _ts = this;
			let dataAttr = this.data.data.attrs;
			console.log('yuml 渲染开始:', dataAttr);
			
			wx.cloud.callFunction({
				name: 'markdown-server',
				data: {
					yuml: dataAttr.value,
					theme: global._theme
				}
			}).then(res => {
				console.log('res', res);
				// 确保 base64 字符串是有效的
				if (res.result && res.result.body) {
					const base64Data = res.result.body.trim(); // 移除可能的空白字符
					_ts.setData({
						attr:{
							src: `data:image/svg+xml;base64,${base64Data}`,
							class: dataAttr.class
						}
					});
				} else {
					console.error('返回的数据格式不正确:', res);
				}
			}).catch(err => {
				console.error('YUML 渲染失败:', err);
			});
		}
	},
	methods: {
		load: function(e) {
			console.log('图片加载成功:', e.detail);
			const _ts = this;
			// 直接使用图片的实际尺寸
			_ts.setData({
				size:{
					w: e.detail.width,
					h: e.detail.height
				}
			});
		},
		handleImageError: function(e) {
			console.error('图片加载失败:', e);
			console.log('src:', this.data.attr.src);
		}
	}
})