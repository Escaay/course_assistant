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
		imageStyle: 'width:320px; height:240px;',  // 初始样式
		isLoading: true  // 添加加载状态
	},
	lifetimes:{
		attached: async function(){
			const _ts = this;
			let dataAttr = this.data.data.attrs;
			console.log('yuml 渲染开始:', dataAttr);
			var c1 = new wx.cloud.Cloud({
				// 资源方 AppID
				resourceAppid: 'wx93739e7f65cff363',
				// 资源方环境 ID
				resourceEnv: 'cloud1-0gys80m48da147a1',
			  })
			  
			  // 跨账号调用，必须等待 init 完成
			  // init 过程中，资源方小程序对应环境下的 cloudbase_auth 函数会被调用，并需返回协议字段（见下）来确认允许访问、并可自定义安全规则
			  await c1.init()
			  c1.callFunction({
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
					_ts.setData({ isLoading: false });
				}
			}).catch(err => {
				console.error('YUML 渲染失败:', err);
				_ts.setData({ isLoading: false });
			});
		}
	},
	methods: {
		load: function(e) {
			console.log('图片加载成功:', e.detail);
			const _ts = this;
			if (e.detail.width && e.detail.height) {
				_ts.setData({
					imageStyle: `width:${e.detail.width}px; height:${e.detail.height}px;`,
					isLoading: false  // 加载完成
				});
			}
		},
		handleImageError: function(e) {
			console.error('图片加载失败:', e);
			console.log('src:', this.data.attr.src);
			this.setData({ isLoading: false });
		}
	}
})