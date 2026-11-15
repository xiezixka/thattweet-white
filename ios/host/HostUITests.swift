import XCTest

final class ThatTweetSafariUITests: XCTestCase {
    @MainActor
    func testChineseSetupContent() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 20))
        let heading = web.staticTexts["在 Safari 中使用 ThatTweet"]
        XCTAssertTrue(heading.waitForExistence(timeout: 20), app.debugDescription)

        let start = XCTAttachment(screenshot: app.screenshot())
        start.name = "中文启用说明"
        start.lifetime = .keepAlways
        add(start)

        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        let rotated = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            web.frame.width > web.frame.height
        }, object: web)
        XCTAssertEqual(XCTWaiter.wait(for: [rotated], timeout: 10), .completed)
        let notice = web.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "iOS 可能暂停后台处理")).firstMatch
        XCTAssertFalse(notice.isHittable, "Landscape must exercise the scroll boundary rather than only a fully visible portrait page")
        for _ in 0..<5 {
            if notice.exists && notice.isHittable { break }
            web.swipeUp()
        }
        XCTAssertTrue(notice.exists && notice.isHittable, "The last setup paragraph must be reachable by scrolling")
        let bottom = XCTAttachment(screenshot: app.screenshot())
        bottom.name = "滚动到最后说明"
        bottom.lifetime = .keepAlways
        add(bottom)
    }
}
