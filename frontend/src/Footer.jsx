
import "./Footer.css";

const Footer = () => {
    return (
        <footer className="attendance-footer">
            <div className="attendance-footer-container">

                {/* Institute information */}
                <div className="footer-institute">
                    <a
                        href="https://www.sggs.ac.in/"
                        target="_blank"
                        rel="noreferrer"
                        className="footer-logo"
                    >
                        <img
                            src="https://wsrv.nl/?url=www.sggs.ac.in%2Fapi%2Fuploads%2Flogos%2Fb3c5b4b7d8164ad7905be5ebbd20c3ca.png&w=480&output=webp&q=90"
                            alt="SGGS Institute Logo"
                        />
                    </a>

                    <p className="footer-tagline">
                        NAAC B+ · NBA · Autonomous · Est. 1981
                    </p>

                    <div className="footer-socials">
                        <a href="https://www.facebook.com/sggsiet/" target="_blank" rel="noreferrer" aria-label="Facebook">f</a>
                        <a href="https://www.instagram.com/sggsietnanded/?hl=en" target="_blank" rel="noreferrer" aria-label="Instagram">◎</a>
                        <a href="https://www.linkedin.com/school/shri-guru-gobind-singhji-institute-of-engineering-and-technology-vishnupuri-nanded" target="_blank" rel="noreferrer" aria-label="LinkedIn">in</a>
                        <a href="https://www.youtube.com/channel/UCp8ahnvGrPIfEfUVgsyplPQ" target="_blank" rel="noreferrer" aria-label="YouTube">▶</a>
                    </div>


                    <div className="footer-map-section">
                        <div className="footer-map-embed">
                            <iframe
                                title="SGGS Institute of Engineering and Technology Location"
                                src="https://maps.google.com/maps?q=Shri%20Guru%20Gobind%20Singhji%20Institute%20of%20Engineering%20and%20Technology%2C%20Vishnupuri%2C%20Nanded&t=&z=15&ie=UTF8&iwloc=&output=embed"
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                                allowFullScreen
                            />
                            <a
                                className="footer-map-button"
                                href="https://www.google.com/maps/search/?api=1&query=SGGS+Institute+of+Engineering+and+Technology+Nanded"
                                target="_blank"
                                rel="noreferrer"
                            >
                                Maps ↗
                            </a>
                        </div>

                        <div className="footer-map-address">
                            <span className="footer-map-pin">♧</span>
                            <div>
                                <strong>Vishnupuri</strong>
                                <p>Nanded (Maharashtra State)</p>
                                <p>India · PIN 431606</p>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Attendance system links */}
                <div className="footer-column">
                    <h4>ATTENDANCE</h4>
                    <a href="#overview">Dashboard</a>
                    <a href="#upload">Upload Attendance</a>
                    <a href="#reports">Attendance Reports</a>
                    <a href="#notifications">Notifications</a>
                </div>

                {/* How it works */}
                <div className="footer-column">
                    <h4>QUICK LINKS</h4>
                    <a href="#overview">How It Works</a>
                    <a href="#upload">Excel Guidelines</a>
                    <a href="#reports">View Reports</a>
                    <a href="#about">About the Project</a>
                </div>

                {/* Support */}
                <div className="footer-column footer-contact">
                    <h4>SUPPORT & CONTACT</h4>
                    <p>
                        Smart Attendance Console
                    </p>
                    <a href="mailto:director@sggs.ac.in">
                        ✉ director@sggs.ac.in
                    </a>
                    <a href="tel:02462269234">
                        ☎ 02462-269234
                    </a>
                    <p className="footer-note">
                        Review attendance records before sending notifications.
                    </p>
                </div>
                <div className="footer-column">
                    <h4>SYSTEM FEATURES</h4>
                    <a href="#upload">Excel Upload & Validation</a>
                    <a href="#reports">Attendance Reports</a>
                    <a href="#notifications">Parent Email Alerts</a>
                    <a href="#notifications">SMS Notifications</a>


                </div>
                 <div className="footer-info-center">
    <div className="footer-info-card">
      <h4>HOW IT WORKS</h4>
      <p>
        Upload attendance, review student records,
        and send notifications after verification.
      </p>
    </div>

    <div className="footer-info-card">
      <h4>RESPONSIBLE NOTIFICATIONS</h4>
      <p>
        Verify student details and recipient information
        before sending alerts.
      </p>
    </div>
  </div>



            </div>







            {/* Bottom copyright */}
            <div className="footer-bottom">
                <div className="footer-bottom-inner">
                    <span>
                        © {new Date().getFullYear()} SGGS Institute of Engineering
                        & Technology
                    </span>
                    <span className="footer-bottom-right">
                        Smart Attendance System · Built for better communication
                    </span>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
