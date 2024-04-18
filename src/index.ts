import mitt from '@xiaohaih/mitt';

function loop() {}
/** 对消息做处理 */
function packagingMsg(data: any) {
    switch (Object.prototype.toString.call(data).slice(8, -1)) {
        case 'Object':
        case 'Array':
        case 'Boolean': {
            return JSON.stringify(data);
        }
        default: return data;
    }
}

/** 配置项信息 */
export interface SocketOption<MsgResult, Msg, Ack> {
    /** 连接地址 */
    url?: string | URL;
    /** 连接协议 */
    protocols?: string | string[] | undefined;
    /** 心跳间隔(ms), 等于 null 时禁用心跳 @default 25000 */
    pingInterval?: number | null;
    /** 心跳发送的信息 */
    pingMessage?: string;
    /** 是否需要重连 @default true */
    reconnection?: boolean;
    /** 重连次数 @default Infinity */
    reconnectionAttempts?: number;
    /** 重连间隔 @default 1000 */
    reconnectionDelay?: number;
    /** 重连抖动时长 @default 0.5 */
    randomizationFactor?: number;
    /** 对监听事件做些副作用事情(在监听事件执行后再执行) */
    onceEffect?: <K extends EmitterEvent<MsgResult, Msg, Ack>>(type: K, cb: (...args: any[]) => void) => void;
    /** 对监听事件做些副作用事情(在监听事件执行后再执行) */
    onEffect?: <K extends EmitterEvent<MsgResult, Msg, Ack>>(type: K, cb: (...args: any[]) => void) => void;
    /** 对监听事件做些副作用事情(在监听事件执行后再执行) */
    offEffect?: <K extends EmitterEvent<MsgResult, Msg, Ack>>(type: K, cb: (...args: any[]) => void) => void;
    /** 格式化发送的数据 */
    packagingMessage?: (data: Msg) => string | ArrayBufferLike | Blob | ArrayBufferView;
    /** 解析返回的数据 */
    parserMessage?: (msg: MessageEvent, socket: Socket<MsgResult, Msg, Ack>) => MsgResult;
    /** 设置回执(针对消息做回执处理, 防止消息之间产生依赖) */
    setAck?: (msg: Msg, socket: Socket<MsgResult, Msg, Ack>, callback: (res: Ack) => void) => void;
}
type PartialOption = 'protocols' | 'onEffect' | 'onceEffect' | 'offEffect';

/* eslint-disable ts/consistent-type-definitions */
/** socket 事件声明 */
export type EmitterEvent<MsgResult, Msg, Ack> = {
    /** socket 连接事件 */
    open: { native: Event } & Socket<MsgResult, Msg, Ack>;
    /** 消息接收事件 */
    message: MsgResult;
    /** socket 结束事件 */
    close: { native: CloseEvent } & Socket<MsgResult, Msg, Ack>;
    /** socket 报错事件 */
    error: { native: Event } & Socket<MsgResult, Msg, Ack>;
    /** 重连事件 */
    reconnect: number;
    /** 销毁事件 */
    destroy: void;
};
/** 创建 socket 实例 */
export class Socket<MsgResult = MessageEvent, Msg = unknown, Ack = unknown> {
    /** socket 实例 */
    instance: WebSocket | null = null;
    /** 未连接前缓存的数据(连接后立即发出) */
    sendBuffer: { data: [data: any, ack?: (arg: Ack) => void] }[] = [];
    /** 心跳 timer */
    pingTimer = 0;
    /** 是否允许重连标志(与传递进来的 reconnection 作用不一样) */
    reconnectionFlag = false;
    /** 重连 timer */
    reconnectionTimer = 0;
    /** 当前重连 timer */
    reconnectionCount = 0;
    /** 传递的配置项 */
    option: Omit<Required<SocketOption<MsgResult, Msg, Ack>>, PartialOption> & Pick<SocketOption<MsgResult, Msg, Ack>, PartialOption>;
    /** 事件监听 */
    emitter = mitt<EmitterEvent<MsgResult, Msg, Ack>>();

    constructor(option?: SocketOption<MsgResult, Msg, Ack>) {
        /** socket 的配置项 */
        this.option = {
            url: '',
            pingInterval: 25000,
            pingMessage: '',
            reconnection: true,
            reconnectionAttempts: Number.POSITIVE_INFINITY,
            reconnectionDelay: 1000,
            randomizationFactor: 0.5,
            setAck: loop,
            packagingMessage: packagingMsg,
            parserMessage: (v) => v as MsgResult,
            ...option,
        };
    }

    get on() {
        return this.emitter.on;
    }

    get once() {
        return this.emitter.once;
    }

    get emit() {
        return this.emitter.emit;
    }

    get off() {
        return this.emitter.off;
    }

    /** socket 连接状态 */
    get connected() {
        return !!this.instance;
    }

    /** 更新传递的配置信息 */
    updateOption = (option: SocketOption<MsgResult, Msg, Ack>) => {
        option && Object.assign(this.option, option);
        return this;
    };

    /** 初始化 socket 连接 */
    connect = () => {
        this.connectAwait();
        return this;
    };

    /** 连接过程中保存的 promise */
    _connectingPromise: Promise<this> | null = null;
    /** 连接过程中保存的 resolve */
    _connectingResolve: ((val: this) => void) | null = null;
    /** 连接过程中保存的 reject */
    _connectingReject: ((err: Error) => void) | null = null;
    /** 初始化 socket 连接并等待成功 */
    connectAwait = async () => {
        const { url, reconnectionAttempts } = this.option;
        if (!url) { throw new Error('socket uri not exist'); }
        if (this.instance) { return this; }
        if (this._connectingPromise) { return this._connectingPromise; }
        const _instance = new WebSocket(url);
        if (!this._connectingPromise) {
            this._connectingPromise = new Promise<this>((resolve, reject) => {
                this._connectingResolve = resolve;
                this._connectingReject = reject;
            });
        }
        _instance.onopen = (ev: Event) => {
            const { sendBuffer } = this;
            this._connectingResolve?.(this);
            this.resetStatus();
            this.instance = _instance;
            _instance.onclose = this.onclose;
            this.onopen(ev);
            sendBuffer.forEach((o) => this.send(o.data[0], o.data[1]));
        };
        _instance.onerror = (ev: Event) => {
            this.onerror(ev);
            if (this.reconnectionCount >= reconnectionAttempts) {
                this._connectingReject?.(new Error('超过连接次数'));
                this._connectingPromise = this._connectingResolve = this._connectingReject = null;
            }
        };
        _instance.onmessage = this.onmessage;
        /** 默认不注册 close 事件, 在连接成功后再注册 */
        /** _instance.onclose = this.onclose; */
        return this._connectingPromise as Promise<this>;
    };

    /** 打开连接 */
    onopen = (ev: Event) => {
        if (!this.instance) { return this; }
        // @ts-expect-error 没看明白为什么报错
        this.emitter.emit('open', { ...this, native: ev });
        this.ping();
        return this;
    };

    /** 接收信息 */
    onmessage = (ev: MessageEvent) => {
        this.emitter.emit('message', this.option.parserMessage(ev, this));
        return this;
    };

    /** 关闭连接 */
    onclose = (ev: CloseEvent) => {
        // @ts-expect-error 没看明白为什么报错
        this.emitter.emit('close', { ...this, native: ev });
        if (ev.code !== 1000) {
            this.instance = null;
            this.reconnect();
        }
        return this;
    };

    /** 连接错误 */
    onerror = (ev: Event) => {
        // 连接错误不应该手动触发 close 事件
        // this.instance?.close(1000);
        // this.instance = null;
        // @ts-expect-error 没看明白为什么报错
        this.emitter.emit('error', { ...this, native: ev });
        this.reconnect();
        return this;
    };

    /** socket 重连 */
    reconnect = () => {
        const { reconnectionAttempts, reconnectionDelay } = this.option;
        clearTimeout(this.reconnectionTimer);
        // if (!this.reconnectionFlag) { return; }
        if (this.reconnectionCount >= reconnectionAttempts) { return this; }
        this.reconnectionCount++;
        this.emitter.emit('reconnect', this.reconnectionCount);
        this.reconnectionTimer = setTimeout(this.connect, reconnectionDelay) as unknown as number;
        return this;
    };

    /**
     * 发送数据
     * @param {any} data 发送的数据
     */
    send = (data: any, ack?: (arg: Ack) => void) => {
        if (this.instance) {
            this.instance.send(this.option.packagingMessage(data));
            ack && this.option.setAck(data, this, ack);
        }
        else {
            this.sendBuffer.push({ data: [data, ack] });
        }
        return this;
    };

    /**
     * 发送数据并等待回执
     * @param {any} data 发送的数据
     */
    sendWithAck = async (data: any) => {
        return new Promise<Ack>((resolve, reject) => {
            this.send(data, resolve);
        });
    };

    /** 开始发送心跳 */
    ping = () => {
        const { pingInterval, pingMessage } = this.option;
        if (!pingInterval) { return; }
        this.pong();
        this.pingTimer = setInterval(() => {
            if (!this.instance) { return this.pong(); }
            // 心跳消息不走包装的 send
            // this.send(pingMessage);
            this.instance.send(pingMessage);
        }, pingInterval) as unknown as number;
        return this;
    };

    /** 停止发送心跳 */
    pong = () => {
        clearInterval(this.pingTimer);
        this.pingTimer = 0;
        return this;
    };

    /** 重置 socket 状态 */
    resetStatus = () => {
        this.instance = this._connectingPromise = this._connectingResolve = this._connectingReject = null;
        this.reconnectionFlag = false;
        this.sendBuffer = [];
        this.reconnectionCount = this.reconnectionTimer = this.pingTimer = 0;
    };

    /** 销毁 socket */
    destroy = () => {
        this.instance?.close(1000);
        this.pong();
        // 因关闭事件中存在重连回调
        // 所以在这里清空重连事件
        clearTimeout(this.reconnectionTimer);
        this.resetStatus();
        this.emitter.emit('destroy');
        return this;
    };
}

/** 创建 socket 实例 */
export function socket<MsgResult, Msg, Ack>(options?: SocketOption<MsgResult, Msg, Ack>) {
    return new Socket(options);
}