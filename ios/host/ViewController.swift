import UIKit
import WebKit

final class ViewController: UIViewController {
    @IBOutlet private var webView: WKWebView!

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        // The setup page is instructions, not an X browser without the extension.
        configuration.dataDetectorTypes = []
        webView = WKWebView(frame: .zero, configuration: configuration)
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // The generated template disables scrolling, clipping setup steps on iPhone.
        webView.scrollView.isScrollEnabled = true
        webView.isOpaque = false
        webView.backgroundColor = .white
        view.backgroundColor = .white
        guard let page = Bundle.main.url(forResource: "Main", withExtension: "html") else {
            assertionFailure("Missing bundled setup page")
            return
        }
        webView.loadFileURL(page, allowingReadAccessTo: Bundle.main.resourceURL!)
    }
}
