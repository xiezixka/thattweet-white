import UIKit
import WebKit

final class ViewController: UIViewController {
    @IBOutlet private var webView: WKWebView!

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
