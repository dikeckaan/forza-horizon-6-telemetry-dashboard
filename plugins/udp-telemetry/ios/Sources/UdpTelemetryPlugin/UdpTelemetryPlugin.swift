import Foundation
import Network
import Capacitor

/// Listens for Forza "Data Out" datagrams and forwards each one to JS as base64.
@objc(UdpTelemetryPlugin)
public class UdpTelemetryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "UdpTelemetryPlugin"
    public let jsName = "UdpTelemetry"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAddresses", returnType: CAPPluginReturnPromise)
    ]

    private var listener: NWListener?
    private var connections: [NWConnection] = []
    private let queue = DispatchQueue(label: "udp-telemetry")

    @objc func start(_ call: CAPPluginCall) {
        let port = call.getInt("port") ?? 20440
        stopInternal()
        guard let nwPort = NWEndpoint.Port(rawValue: UInt16(clamping: port)) else {
            call.reject("Invalid port \(port)")
            return
        }
        do {
            let params = NWParameters.udp
            params.allowLocalEndpointReuse = true
            let l = try NWListener(using: params, on: nwPort)
            l.newConnectionHandler = { [weak self] conn in self?.accept(conn) }
            l.start(queue: queue)
            listener = l
            call.resolve()
        } catch {
            call.reject("UDP port \(port) could not be opened: \(error.localizedDescription)")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        stopInternal()
        call.resolve()
    }

    @objc func getAddresses(_ call: CAPPluginCall) {
        var out: [String] = []
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        if getifaddrs(&ifaddr) == 0, let first = ifaddr {
            var ptr: UnsafeMutablePointer<ifaddrs>? = first
            while let p = ptr {
                let flags = Int32(p.pointee.ifa_flags)
                if let addr = p.pointee.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET),
                   (flags & IFF_UP) != 0, (flags & IFF_LOOPBACK) == 0 {
                    var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                    getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST)
                    out.append(String(cString: host))
                }
                ptr = p.pointee.ifa_next
            }
            freeifaddrs(ifaddr)
        }
        call.resolve(["addresses": out])
    }

    private func accept(_ conn: NWConnection) {
        connections.append(conn)
        conn.start(queue: queue)
        receive(conn)
    }

    private func receive(_ conn: NWConnection) {
        conn.receiveMessage { [weak self] data, _, _, error in
            guard let self = self else { return }
            if let data = data, !data.isEmpty {
                self.notifyListeners("packet", data: ["data": data.base64EncodedString(), "from": "\(conn.endpoint)"])
            }
            if error == nil { self.receive(conn) }
        }
    }

    private func stopInternal() {
        listener?.cancel()
        listener = nil
        connections.forEach { $0.cancel() }
        connections.removeAll()
    }

    deinit { stopInternal() }
}
