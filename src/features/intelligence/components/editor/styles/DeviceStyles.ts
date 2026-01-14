export const MARVEL_DEVICES_CSS = `
.marvel-device {
    display: inline-block;
    position: relative;
    box-sizing: content-box !important;
}

.marvel-device .screen {
    width: 100%;
    position: relative;
    height: 100%;
    z-index: 3;
    background: white;
    overflow: hidden;
    display: block;
    border-radius: 1px;
    box-shadow: 0 0 0 3px #111;
}

.marvel-device.iphone-x {
    width: 375px;
    height: 812px;
    padding: 26px;
    background: #222;
    border-radius: 68px;
    box-shadow: inset 0 0 2px 2px hsla(0,0%,100%,.05), inset 0 0 0 7px #000, 0 20px 50px rgba(0,0,0,.3);
}

.marvel-device.iphone-x .screen {
    border-radius: 40px;
    box-shadow: none;
}

.marvel-device.iphone-x .notch {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 209px;
    height: 30px;
    background: #000;
    z-index: 4;
    border-bottom-left-radius: 20px;
    border-bottom-right-radius: 20px;
}

.marvel-device.iphone-x .notch:before,
.marvel-device.iphone-x .notch:after {
    content: "";
    position: absolute;
    top: 0;
    width: 10px;
    height: 10px;
    background: #000;
}

.marvel-device.iphone-x .notch:before {
    left: -10px;
    border-top-right-radius: 10px;
}

.marvel-device.iphone-x .notch:after {
    right: -10px;
    border-top-left-radius: 10px;
}

.marvel-device.iphone-x .camera {
    position: absolute;
    left: 152px;
    top: 7px;
    width: 8px;
    height: 8px;
    background: #111;
    border-radius: 50%;
}

.marvel-device.iphone-x .speaker {
    position: absolute;
    left: 81px;
    top: 8px;
    width: 48px;
    height: 6px;
    background: #111;
    border-radius: 3px;
}
`;
