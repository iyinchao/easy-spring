export interface SpringConfig {
    mass?: number;
    tension?: number;
    friction?: number;
    precision?: number;
    velocity?: number;
    clamp?: boolean;
}

export type SpringOption = {
    config?: SpringConfig;
    value?: number;
    onChange?: (spring: SpringController) => void;
    onStart?: (spring: SpringController) => void;
    onRest?: (spring: SpringController) => void;
};

export type SpringController = {
    readonly current: number;
    readonly goal: number;
    readonly config: SpringConfig;
    start: (value: number, config?: SpringConfig) => void;
    set: (value: number) => void;
    pause: () => void;
    remove: () => void;
};

type SpringInfo = {
    runtime: {
        goal: number;
        current: number;
        v: number;
        running: boolean;
        startConfig?: Required<SpringConfig>;
    };
    config: Required<SpringConfig>;
};

const springDefaultConfig: Required<SpringConfig> = {
    mass: 1,
    tension: 170,
    friction: 26,
    precision: 0.01,
    velocity: 0,
    clamp: false,
};

const frameResolution = 1000 / 60 / 100;

const generateId = (existingKeys: string[]) => {
    let key = '';
    do {
        key = `${Math.floor(Math.random() * 1e15)}`;
    } while (existingKeys.includes(key));

    return key;
};

export const EasySpring = {
    springs: new Map<
        string,
        {
            option: SpringOption;
            info: SpringInfo;
            controller: SpringController;
        }
    >(),
    info: {
        raf: null as null | number,
        lastT: -1,
    },
    startAnimationFrame() {
        if (this.info.raf) {
            return;
        }

        const onFrame = (t: number) => {
            this.info.raf = requestAnimationFrame(onFrame);

            if (this.info.lastT < 0) {
                this.info.lastT = t;
            }

            let deltaT = t - this.info.lastT;
            this.info.lastT = t;

            // detect a abnormal super long frame (system lagging or debug pause)
            // discard and restart
            if (deltaT > 100) {
                this.info.lastT = -1;
                return;
            }

            const hPFrameFactor = Math.round(deltaT / frameResolution);

            this.springs.forEach(({ option, info, controller }) => {
                const config = info.runtime.startConfig ?? info.config;
                for (let i = 1; i <= hPFrameFactor; i++) {
                    const deltaTH = deltaT / hPFrameFactor;

                    const offset = info.runtime.goal - info.runtime.current;

                    // check rest
                    if (offset === 0 && info.runtime.v === 0) {
                        if (info.runtime.running) {
                            option.onRest?.(controller);
                            info.runtime.running = false;
                            //
                            this.checkIdle();
                        }
                        return;
                    } else if (
                        Math.abs(offset) < config.precision &&
                        Math.abs(info.runtime.v) < config.precision
                    ) {
                        info.runtime.v = 0;
                        info.runtime.current = info.runtime.goal;
                        option.onChange?.(controller);
                        option.onRest?.(controller);
                        info.runtime.running = false;
                        this.checkIdle();
                        return;
                    }
                    // TODO: support clamp

                    const f = config.tension * offset;
                    const a = (f - config.friction * info.runtime.v) / config.mass;
                    const deltaV = (a * deltaTH) / 1000;
                    info.runtime.v += deltaV;
                    const deltaD = (info.runtime.v * deltaTH) / 1000;
                    info.runtime.current += deltaD;

                    info.runtime.running = true;
                }

                option.onChange?.(controller);
            });
        };
        this.info.raf = requestAnimationFrame(onFrame);
    },
    stopAnimationFrame() {
        if (this.info.raf !== null) {
            // debugger
            cancelAnimationFrame(this.info.raf);
            this.info.raf = null;
        }
        this.info.lastT = -1;
    },
    checkIdle() {
        let hasRunning = false;
        this.springs.forEach((v) => {
            hasRunning = hasRunning || v.info.runtime.running;
        });

        if (!hasRunning) {
            this.stopAnimationFrame();
        }
    },
    controller(option: SpringOption) {
        const springs = this.springs;
        const rootThis = this;
        const id = generateId(Array.from(springs.keys()));

        const info: SpringInfo = {
            runtime: {
                goal: 0,
                current: option.value ?? 0,
                v: 0,
                running: false,
            },
            config: {
                ...springDefaultConfig,
                ...option.config,
            },
        };

        const controller: SpringController = {
            get current() {
                return info.runtime.current;
            },
            get goal() {
                return info.runtime.goal;
            },
            get config() {
                return { ...info.config };
            },
            start(value, config) {
                info.runtime.goal = value;
                info.runtime.running = true;
                info.runtime.startConfig = { ...springDefaultConfig, ...this.config, ...config };
                info.runtime.v = info.runtime.startConfig.velocity ?? 0;
                option.onStart?.(this);
                rootThis.startAnimationFrame.call(rootThis);
            },
            // TODO: support pause
            pause() { },
            set(value) {
                let hasChanged = value !== info.runtime.current;

                info.runtime.goal = value;
                info.runtime.current = value;
                info.runtime.v = 0;
                info.runtime.running = false;

                if (hasChanged) {
                    option.onChange?.(this);
                }

                rootThis.checkIdle();
            },
            remove() {
                springs.delete(id);
            },
        };

        this.springs.set(id, {
            option,
            info,
            controller,
        });

        return controller;
    },
};
