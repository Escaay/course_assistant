const config = require('../config');
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
		},
		imageStyle: 'width:320px; height:240px;',  // 初始样式
		isLoading: true  // 添加加载状态
	},
	lifetimes:{
		attached:function(){
			const _ts = this;
			let dataAttr = this.data.data.attrs;
			console.log('LaTeX 公式渲染开始, data:', this.data.data);
			console.log('LaTeX 公式渲染开始, attrs:', dataAttr);
			
			if (!dataAttr || !dataAttr.value) {
				console.error('LaTeX 公式数据无效:', dataAttr);
				_ts.setData({ isLoading: false });
				return;
			}
			
			wx.cloud.callFunction({
				name: 'markdown-server',
				data: {
					tex: dataAttr.value,
					theme: global._theme
				}
			}).then(res => {
				console.log('LaTeX 公式渲染成功:', res);
				// 确保 base64 字符串是有效的
				if (res.result && res.result.body) {
					const base64Data = res.result.body.trim();
					_ts.setData({
						attr:{
							src: `data:image/svg+xml;base64,${base64Data}`,
							class: `${dataAttr.class} ${dataAttr.class}--${dataAttr.type}`
						}
					});
				} else {
					console.error('返回的数据格式不正确:', res);
					_ts.setData({ isLoading: false });
				}
			}).catch(err => {
				console.error('LaTeX 公式渲染失败:', err);
				_ts.setData({ isLoading: false });
			});
		}
	},
	methods: {
		load: function(e) {
			console.log('LaTeX 公式加载成功:', e.detail);
			const _ts = this;
			if (e.detail.width && e.detail.height) {
				_ts.setData({
					imageStyle: `width:${e.detail.width}px; height:${e.detail.height}px;`,
					isLoading: false  // 加载完成
				});
			}
		},
		handleImageError: function(e) {
			console.error('LaTeX 公式加载失败:', e);
			console.log('src:', this.data.attr.src);
			this.setData({ isLoading: false });
		}
	}
})